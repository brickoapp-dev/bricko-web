/* pro-dashboard.js — Dashboard del profesional
   Carga solicitudes pending/quoted desde Supabase y navega a pro-cotizar.html */

const sb = window.supabase_client;

const URG_LABEL = { baja:'Baja', media:'Media', alta:'Urgente' };
const RUBRO_LABELS = {
  plomeria:'Plomería', gas:'Gas', electricidad:'Electricidad',
  albanileria:'Albañilería', pintura:'Pintura', carpinteria:'Carpintería',
  herreria:'Herrería', jardineria:'Jardinería', 'multi-gremio':'Multi-gremio'
};
const TIPO_LABEL = { refaccion:'Refacción', 'obra-nueva':'Obra Nueva' };

let ALL_REQUESTS = [];
let MY_QUOTES = new Map();
let FILTERS = { rubro:'all', tipo:'all', urgencia:'all' };

function getSession(){
  try {
    const s = localStorage.getItem('bricko-session') || sessionStorage.getItem('bricko-session');
    return s ? JSON.parse(s) : null;
  } catch(e){ return null; }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session || !session.userId){ window.location.replace('index.html'); return; }
  if (session.role !== 'profesional'){ window.location.replace('client.html'); return; }

  await loadProUI(session);
  initFilters();
  initLogout();
  initCursorGlow();

  await loadMyQuotes(session.userId);
  await loadRequests();
  updateStats();
});

/* ── UI del profesional en el nav ───────────────────── */
async function loadProUI(session){
  const name = ((session.firstName || '') + ' ' + (session.lastName || '')).trim() || session.email?.split('@')[0] || 'Profesional';
  const initials = (session.firstName?.[0] || name[0] || 'P').toUpperCase();
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('proAv', initials);
  set('proNm', session.firstName || name);
  try {
    const { data: pro } = await sb.from('professionals').select('rubro, rating').eq('id', session.userId).single();
    if (pro){
      set('proTrade', RUBRO_LABELS[pro.rubro] || pro.rubro || '—');
      set('statRating', pro.rating ? pro.rating.toFixed(1) : '—');
    }
  } catch(e){ console.warn('No se pudo cargar professional:', e); }
}

/* ── Mis quotes (para marcar cards como cotizadas) ── */
async function loadMyQuotes(proId){
  try {
    const { data, error } = await sb.from('quotes').select('id, request_id, amount, status').eq('pro_id', proId);
    if (error){ console.warn('Error cargando mis quotes:', error); return; }
    MY_QUOTES = new Map();
    (data || []).forEach(q => MY_QUOTES.set(q.request_id, q));
  } catch(err){ console.warn('Excepción cargando mis quotes:', err); }
}

/* ── Solicitudes abiertas ───────────────────────────── */
async function loadRequests(){
  try {
    const { data, error } = await sb
      .from('requests')
      .select('id, ticket_id, user_id, tipo, rubros, titulo, descripcion, urgencia, direccion, status, etapa, tipo_construccion, superficie, created_at, profiles!requests_user_id_fkey(first_name, last_name, city)')
      .in('status', ['pending','quoted'])
      .order('created_at', { ascending: false });
    if (error){ console.error('Error cargando solicitudes:', error); ALL_REQUESTS = []; }
    else { ALL_REQUESTS = (data || []).map(normalize); }
  } catch(err){ console.error('Excepción cargando solicitudes:', err); ALL_REQUESTS = []; }
  render();
}

function normalize(row){
  const clientName = ((row.profiles?.first_name || '') + ' ' + (row.profiles?.last_name?.[0] || '') + '.').trim() || 'Cliente';
  return {
    id: row.id,
    ticketId: row.ticket_id || ('SOL-' + row.id?.slice(0,4)),
    tipo: row.tipo,
    rubros: row.rubros || [],
    titulo: row.titulo || generateTitle(row),
    descripcion: row.descripcion,
    urgencia: row.urgencia,
    direccion: row.direccion,
    superficie: row.superficie,
    etapa: row.etapa,
    tipoConstruccion: row.tipo_construccion,
    status: row.status,
    createdAt: row.created_at,
    clientName,
    clientCity: row.profiles?.city || '',
    primaryRubro: row.rubros?.[0] || 'multi-gremio'
  };
}

function generateTitle(row){
  if (row.tipo === 'refaccion' && row.rubros?.length)
    return row.rubros.map(r => RUBRO_LABELS[r] || r).join(' + ') + ' — Solicitud';
  if (row.tipo === 'obra-nueva')
    return (row.tipo_construccion
      ? row.tipo_construccion.charAt(0).toUpperCase() + row.tipo_construccion.slice(1)
      : 'Obra Nueva') + ' — Obra Nueva';
  return TIPO_LABEL[row.tipo] || 'Solicitud';
}

/* ── Filtros ────────────────────────────────────────── */
function initFilters(){
  ['filterRubro','filterTipo','filterUrgencia'].forEach(group => {
    const container = document.getElementById(group);
    if (!container) return;
    container.querySelectorAll('.ftab').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const key = group.replace('filter','').toLowerCase();
        FILTERS[key] = btn.dataset.filter;
        render();
      });
    });
  });
}

/* ── Render del feed ────────────────────────────────── */
function render(){
  const feed = document.getElementById('requestsFeed');
  const empty = document.getElementById('feedEmpty');
  const total = document.getElementById('reqTotal');
  if (!feed) return;

  const list = ALL_REQUESTS.filter(r => {
    if (FILTERS.rubro !== 'all' && !r.rubros.includes(FILTERS.rubro)) return false;
    if (FILTERS.tipo !== 'all'){
      const wanted = FILTERS.tipo === 'obra' ? 'obra-nueva' : FILTERS.tipo;
      if (r.tipo !== wanted) return false;
    }
    if (FILTERS.urgencia !== 'all' && r.urgencia !== FILTERS.urgencia) return false;
    return true;
  });

  if (total) total.textContent = list.length + ' solicitud' + (list.length === 1 ? '' : 'es');

  if (!list.length){
    feed.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  feed.innerHTML = list.map((r, i) => cardHTML(r, i)).join('');

  feed.querySelectorAll('[data-req]').forEach(card => {
    const go = () => { window.location.href = 'pro-cotizar.html?req=' + card.dataset.req; };
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); }
    });
  });
}

function cardHTML(r, i){
  const urgClass = 'urg-' + (r.urgencia || 'media');
  const obraClass = r.tipo === 'obra-nueva' ? ' t-obra' : '';
  const quoted = MY_QUOTES.has(r.id);
  return `
    <article class="req-card${quoted ? ' quoted' : ''}" data-req="${r.id}" tabindex="0" style="animation-delay:${i*0.045}s">
      ${quoted ? '<span class="rc-ribbon">✓ ENVIADO</span>' : ''}
      <div class="rc-head">
        <div class="rc-tags">
          <span class="rc-tag">${escapeHTML(RUBRO_LABELS[r.primaryRubro] || r.primaryRubro)}</span>
          <span class="rc-tag${obraClass}">${escapeHTML(TIPO_LABEL[r.tipo] || r.tipo)}</span>
        </div>
        <span class="rc-urg ${urgClass}">${escapeHTML(URG_LABEL[r.urgencia] || r.urgencia)}</span>
      </div>
      <h3 class="rc-title">${escapeHTML(r.titulo)}</h3>
      <p class="rc-desc">${escapeHTML((r.descripcion || '').slice(0,160))}${(r.descripcion?.length > 160) ? '…' : ''}</p>
      <div class="rc-foot">
        <span class="rc-loc">${escapeHTML(r.direccion || r.clientCity || '—')}</span>
        <span class="sep"></span>
        <span>${timeAgo(r.createdAt)}</span>
      </div>
      <div class="rc-cta-row">
        <span class="rc-quotes">${escapeHTML(r.clientName)}</span>
        <span class="rc-go">${quoted ? 'Ya cotizada' : 'Ver y cotizar'} <span class="arrow"></span></span>
      </div>
    </article>
  `;
}

/* ── Stats del nav ──────────────────────────────────── */
function updateStats(){
  const newCount = ALL_REQUESTS.filter(r => !MY_QUOTES.has(r.id)).length;
  const myAccepted = [...MY_QUOTES.values()].filter(q => q.status === 'accepted').length;
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('statNew', newCount);
  set('statActive', myAccepted);
}

/* ── Logout ─────────────────────────────────────────── */
function initLogout(){
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    try { await Auth.logout(); } catch(e){
      localStorage.removeItem('bricko-session');
      sessionStorage.removeItem('bricko-session');
      localStorage.removeItem('bricko-user');
      window.location.replace('index.html');
    }
  });
}

/* ── Toast ───────────────────────────────────────────── */
const TICONS = {
  ok:   '<path d="M20 6L9 17l-5-5"/>',
  err:  '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 11v5"/>'
};
function toast(type, title, msg){
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'ok' ? 'ok' : type === 'err' ? 'err' : '');
  el.innerHTML = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor">${TICONS[type] || TICONS.info}</svg><div><div class="t">${title}</div><div class="m">${msg}</div></div>`;
  stack.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 4200);
}

/* ── Cursor glow ─────────────────────────────────────── */
function initCursorGlow(){
  if (!window.matchMedia('(pointer:fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let raf = null;
  window.addEventListener('pointermove', (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      document.body.classList.add('spot-on');
      document.body.style.setProperty('--mx', e.clientX + 'px');
      document.body.style.setProperty('--my', e.clientY + 'px');
      raf = null;
    });
  });
  window.addEventListener('mouseleave', () => document.body.classList.remove('spot-on'));
}

/* ── Helpers ─────────────────────────────────────────── */
function timeAgo(dateStr){
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff/60000);
  if (min < 1) return 'recién';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.floor(min/60);
  if (h < 24) return 'hace ' + h + ' h';
  const days = Math.floor(h/24);
  if (days === 1) return 'ayer';
  if (days < 7) return 'hace ' + days + ' días';
  return d.toLocaleDateString('es-AR');
}

function escapeHTML(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
