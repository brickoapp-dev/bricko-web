/* pro-dashboard.js — Dashboard del profesional con perfil completo, modal de edición y feed filtrable */

const sb = window.supabase_client;

const URG_LABEL = { baja:'Baja', media:'Media', alta:'Urgente' };
const RUBRO_LABELS = {
  plomeria:'Plomería', gas:'Gas', electricidad:'Electricidad',
  albanileria:'Albañilería', pintura:'Pintura', carpinteria:'Carpintería',
  herreria:'Herrería', jardineria:'Jardinería', 'multi-gremio':'Multi-gremio'
};
const TIPO_LABEL = { refaccion:'Refacción', 'obra-nueva':'Obra Nueva', 'obra':'Obra Nueva' };

let ALL_REQUESTS = [];
let MY_QUOTES = new Map();
let PRO_PROFILE = null;
let FILTERS = { zone:'myzone', rubro:'all', tipo:'all', urgencia:'all' };

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

  await loadProFullProfile(session);
  initFilters();
  initLogout();
  initThemeToggle();
  initCursorGlow();

  await loadMyQuotes(session.userId);
  await loadRequests();
  updateStats();
  await loadMisObras();
});

/* ── Mis obras: preparación / ejecución (hitos) ─────────── */
async function loadMisObras(){
  const wrap = document.getElementById('misObrasWrap');
  const list = document.getElementById('misObrasList');
  if (!wrap || !list) return;

  const { data: preps, error } = await sb
    .from('obra_preparacion')
    .select('request_id, gate_habilitada, requests(ticket_id, titulo, status)')
    .order('created_at', { ascending: false });

  if (error || !preps || !preps.length){ wrap.style.display = 'none'; return; }

  wrap.style.display = '';
  list.innerHTML = preps.map(p => {
    const req = p.requests;
    const enCurso = p.gate_habilitada && req?.status !== 'done';
    const label = !p.gate_habilitada ? 'Preparar obra adjudicada' : (req?.status === 'done' ? 'Obra finalizada' : 'Obra en ejecución');
    const href = !p.gate_habilitada ? `pro-preobra.html?req=${p.request_id}` : `pro-ejecucion.html?req=${p.request_id}`;
    const statusClass = !p.gate_habilitada ? 'warn' : (req?.status === 'done' ? 'ok' : 'orange');
    const statusLabel = !p.gate_habilitada ? 'En preparación' : (req?.status === 'done' ? 'Finalizada' : 'En curso');
    return `
      <div class="pj-list-row">
        <div><h3>${escapeHTML(label)}</h3><div class="pj-meta"><span>${escapeHTML(req?.ticket_id || '')}</span><span>${escapeHTML(req?.titulo || '')}</span></div></div>
        <div class="pj-actions"><span class="pj-status ${statusClass}">${statusLabel}</span><a class="pj-btn primary" href="${href}">${!p.gate_habilitada ? 'Continuar' : 'Abrir'}</a></div>
      </div>
    `;
  }).join('');
}

/* ── Cargar Perfil Profesional Completo ─────────────────── */
async function loadProFullProfile(session){
  const userId = session.userId;
  let profileData = null;
  let proData = null;

  try {
    const { data: prof } = await sb.from('profiles').select('*').eq('id', userId).single();
    profileData = prof;
  } catch(e){ console.warn('Error leyendo profiles:', e); }

  try {
    const { data: pro } = await sb.from('professionals').select('*').eq('id', userId).single();
    proData = pro;
  } catch(e){ console.warn('Error leyendo professionals:', e); }

  let verifData = null;
  try {
    const { data: verif } = await sb.from('professional_verification')
      .select('dni_number, dni_front_url, dni_back_url')
      .eq('id', userId)
      .maybeSingle();
    verifData = verif;
  } catch(e){ console.warn('Error leyendo professional_verification:', e); }

  const firstName = profileData?.first_name || session.firstName || '';
  const lastName = profileData?.last_name || session.lastName || '';
  const fullName = (firstName + ' ' + lastName).trim() || session.email?.split('@')[0] || 'Profesional';
  const username = profileData?.username || session.username || session.email?.split('@')[0] || 'profesional';
  const initials = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || 'BR';
  const city = profileData?.city || session.city || '';
  const province = profileData?.province || session.province || '';
  const address = profileData?.address || session.address || '';
  const avatarUrl = profileData?.avatar_url || session.avatarUrl || null;

  const rubros = proData?.rubros?.length ? proData.rubros : (session.rubros?.length ? session.rubros : (proData?.rubro ? [proData.rubro] : ['albanileria']));
  const primaryRubro = rubros[0] || 'albanileria';
  const dniNumber = verifData?.dni_number || session.dniNumber || '—';
  const isVerified = proData?.verified !== false;

  PRO_PROFILE = {
    userId,
    firstName,
    lastName,
    fullName,
    username,
    initials,
    city,
    province,
    address,
    avatarUrl,
    rubros,
    primaryRubro,
    dniNumber,
    isVerified,
    rating: proData?.rating || 5.0,
    jobsCompleted: proData?.jobs_completed || 0,
    dniFrontUrl: verifData?.dni_front_url || session.dniFrontUrl || null,
    dniBackUrl: verifData?.dni_back_url || session.dniBackUrl || null
  };

  renderProfileUI();
}

function renderProfileUI(){
  if (!PRO_PROFILE) return;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('proNm', PRO_PROFILE.fullName);
  const mainRubroLabel = RUBRO_LABELS[PRO_PROFILE.primaryRubro] || PRO_PROFILE.primaryRubro;
  set('proTrade', PRO_PROFILE.rubros.length > 1 ? `${mainRubroLabel} (+${PRO_PROFILE.rubros.length - 1})` : mainRubroLabel);
  set('statRating', PRO_PROFILE.rating ? Number(PRO_PROFILE.rating).toFixed(1) : '5.0');
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
      .select('id, ticket_id, user_id, tipo, rubros, titulo, descripcion, urgencia, direccion, status, etapa, tipo_construccion, superficie, created_at, profiles!requests_user_id_fkey(first_name, last_name, city, province)')
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
    descripcion: (row.descripcion || '').split('[ArchivosJSON:')[0].replace(/\[Modo de pago:\s*[^\]]+\]/, '').trim(),
    urgencia: row.urgencia,
    direccion: row.direccion,
    superficie: row.superficie,
    etapa: row.etapa,
    tipoConstruccion: row.tipo_construccion,
    status: row.status,
    createdAt: row.created_at,
    clientName,
    clientCity: row.profiles?.city || '',
    clientProvince: row.profiles?.province || '',
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
  ['filterZone', 'filterRubro','filterTipo','filterUrgencia'].forEach(group => {
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
  const eyebrow = document.getElementById('feedEyebrow');
  if (!feed) return;

  const proCity = (PRO_PROFILE?.city || '').toLowerCase();
  const proProvince = (PRO_PROFILE?.province || '').toLowerCase();

  const list = ALL_REQUESTS.filter(r => {
    // Filtro Ubicación / Zona
    if (FILTERS.zone === 'myzone' && (proCity || proProvince)) {
      const rCity = (r.clientCity || r.direccion || '').toLowerCase();
      const rProv = (r.clientProvince || '').toLowerCase();
      const matchCity = proCity && rCity.includes(proCity);
      const matchProv = proProvince && (rProv.includes(proProvince) || rCity.includes(proProvince));
      if (!matchCity && !matchProv && rCity !== '') return false;
    }

    // Filtro Rubro
    if (FILTERS.rubro !== 'all' && !r.rubros.includes(FILTERS.rubro)) return false;

    // Filtro Tipo
    if (FILTERS.tipo !== 'all'){
      const wanted = FILTERS.tipo === 'obra' ? 'obra-nueva' : FILTERS.tipo;
      if (r.tipo !== wanted) return false;
    }

    // Filtro Urgencia
    if (FILTERS.urgencia !== 'all' && r.urgencia !== FILTERS.urgencia) return false;

    return true;
  });

  if (eyebrow) {
    eyebrow.textContent = FILTERS.zone === 'myzone' && PRO_PROFILE?.city
      ? `OPORTUNIDADES EN ${PRO_PROFILE.city.toUpperCase()}`
      : `OPORTUNIDADES DE TRABAJO`;
  }

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
        <span class="rc-loc">📍 ${escapeHTML(r.direccion || r.clientCity || 'Ubicación no especificada')}</span>
        <span class="sep"></span>
        <span>${timeAgo(r.createdAt)}</span>
      </div>
      <div class="rc-cta-row">
        <span class="rc-quotes">Cliente: ${escapeHTML(r.clientName)}</span>
        <span class="rc-go">${quoted ? 'Ya cotizada' : 'Ver y cotizar'} <span class="arrow"></span></span>
      </div>
    </article>
  `;
}

/* ── Stats del nav ──────────────────────────────────── */
function updateStats(){
  const newCount = ALL_REQUESTS.filter(r => !MY_QUOTES.has(r.id)).length;
  const myAccepted = [...MY_QUOTES.values()].filter(q => q.status === 'accepted').length;
  const myPending = [...MY_QUOTES.values()].filter(q => q.status === 'pending').length;
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('statNew', newCount);
  set('statActive', myAccepted);
  set('kpiOportunidades', ALL_REQUESTS.length);
  set('kpiEvaluacion', myPending);
  set('kpiAdjudicadas', myAccepted);
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

/* ── Theme toggle ────────────────────────────────────── */
function initThemeToggle(){
  const THEMES = ['dark', 'light', 'blueprint'];
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const html = document.documentElement;
    html.classList.add('theme-anim');
    const next = THEMES[(THEMES.indexOf(html.getAttribute('data-theme') || 'dark') + 1) % THEMES.length];
    html.setAttribute('data-theme', next);
    localStorage.setItem('bricko-theme', next);
    setTimeout(() => html.classList.remove('theme-anim'), 450);
  });
}

/* ── Toast ───────────────────────────────────────────── */
const TICONS = {
  ok:   '<path d="M20 6L9 17l-5-5"/>',
  err:  '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 11v5"/>'
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
