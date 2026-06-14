/* client-dashboard.js — Dashboard del cliente
   Carga solicitudes desde Supabase. Clic en card navega a client-solicitud.html */

const sb = window.supabase_client;

const STATUS_DB_TO_UI = {
  pending:   { key: 'pendiente', label: 'Pendiente' },
  quoted:    { key: 'cotizando', label: 'Cotizando' },
  active:    { key: 'activo',    label: 'En curso' },
  done:      { key: 'completado', label: 'Finalizada' },
  cancelled: { key: 'cancelado', label: 'Cancelada' }
};
const URG_LABEL = { baja:'Baja', media:'Media', alta:'Urgente' };
const RUBRO_LABELS = {
  plomeria:'Plomería', gas:'Gas', electricidad:'Electricidad',
  albanileria:'Albañilería', pintura:'Pintura', carpinteria:'Carpintería',
  herreria:'Herrería', jardineria:'Jardinería', 'multi-gremio':'Multi-gremio'
};
const TIPO_LABEL = { refaccion:'Refacción', 'obra-nueva':'Obra Nueva' };

let MY_REQUESTS = [];
let FILTER = 'all';
let SORT = 'fecha';

function getSession(){
  try {
    const s = localStorage.getItem('bricko-session') || sessionStorage.getItem('bricko-session');
    return s ? JSON.parse(s) : null;
  } catch(e){ return null; }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session || !session.userId){ window.location.replace('index.html'); return; }
  if (session.role === 'profesional'){ window.location.replace('pro.html'); return; }

  loadUserUI(session);
  initActionCards();
  initFilters();
  initSort();
  initLogout();
  initCursorGlow();

  await loadRequests(session.userId);
});

/* ── UI: usuario en el nav ───────────────────────────── */
function loadUserUI(session){
  const name = ((session.firstName || '') + ' ' + (session.lastName || '')).trim() || session.email?.split('@')[0] || 'Usuario';
  const initials = (session.firstName?.[0] || name[0] || 'U').toUpperCase();
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('navUserName', session.firstName || name);
  set('userAv', initials);
  set('userNm', session.firstName || name);
}

/* ── Action cards ────────────────────────────────────── */
function initActionCards(){
  document.getElementById('cardRefaccion')?.addEventListener('click', () => {
    window.location.href = 'solicitud-refaccion.html';
  });
  document.getElementById('cardObra')?.addEventListener('click', () => {
    window.location.href = 'solicitud-obra.html';
  });
}

/* ── Cargar solicitudes ──────────────────────────────── */
async function loadRequests(userId){
  const countEl = document.getElementById('reqCount');
  try {
    const { data, error } = await sb
      .from('requests')
      .select('id, ticket_id, tipo, rubros, titulo, descripcion, urgencia, direccion, status, etapa, tipo_construccion, superficie, created_at, quotes(count)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error){ console.error('Error cargando solicitudes:', error); MY_REQUESTS = []; }
    else { MY_REQUESTS = (data || []).map(normalize); }
  } catch(err){ console.error('Excepción cargando solicitudes:', err); MY_REQUESTS = []; }

  const active = MY_REQUESTS.filter(r => r.statusKey !== 'completado' && r.statusKey !== 'cancelado');
  if (countEl) countEl.textContent = (active.length || 0) + ' activa' + (active.length === 1 ? '' : 's');

  render();
}

function normalize(row){
  const st = STATUS_DB_TO_UI[row.status] || { key: row.status, label: row.status };
  const quotesCount = row.quotes?.[0]?.count ?? 0;
  return {
    id: row.id,
    ticketId: row.ticket_id || ('BX-' + row.id?.slice(0,4)),
    tipo: row.tipo,
    rubros: row.rubros || [],
    titulo: row.titulo || generateTitle(row),
    descripcion: row.descripcion,
    urgencia: row.urgencia,
    direccion: row.direccion,
    etapa: row.etapa,
    tipoConstruccion: row.tipo_construccion,
    superficie: row.superficie,
    status: row.status,
    statusKey: st.key,
    statusLabel: st.label,
    createdAt: row.created_at,
    quotesCount
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

/* ── Filtros y sort ──────────────────────────────────── */
function initFilters(){
  document.querySelectorAll('#reqFilters .rfil').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#reqFilters .rfil').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      FILTER = btn.dataset.filter;
      render();
    });
  });
}
function initSort(){
  const sel = document.getElementById('reqSort');
  if (!sel) return;
  sel.addEventListener('change', () => { SORT = sel.value; render(); });
}

/* ── Render del grid ─────────────────────────────────── */
function render(){
  const grid = document.getElementById('requestsGrid');
  const empty = document.getElementById('emptyRequests');
  if (!grid) return;

  let list = [...MY_REQUESTS];
  if (FILTER !== 'all') list = list.filter(r => r.statusKey === FILTER);
  if (SORT === 'urgencia'){
    const order = { alta:0, media:1, baja:2 };
    list.sort((a,b) => (order[a.urgencia] ?? 99) - (order[b.urgencia] ?? 99));
  } else if (SORT === 'status'){
    list.sort((a,b) => a.statusKey.localeCompare(b.statusKey));
  } else {
    list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  if (!list.length){
    grid.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  grid.innerHTML = list.map(cardHTML).join('');
  grid.querySelectorAll('[data-req]').forEach(card => {
    const go = () => { window.location.href = 'client-solicitud.html?req=' + card.dataset.req; };
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); }
    });
  });
}

function cardHTML(r){
  const urgClass = 'urg-' + (r.urgencia || 'media');
  const hasQuotes = r.quotesCount > 0;
  return `
    <article class="req-card" data-req="${r.id}" tabindex="0">
      <div class="req-card-top-line"></div>
      <div class="rc-head">
        <span class="rc-id">${escapeHTML(r.ticketId)}</span>
        <span class="req-status ${r.statusKey}">${escapeHTML(r.statusLabel)}</span>
      </div>
      <h3 class="rc-title">${escapeHTML(r.titulo)}</h3>
      <p class="rc-desc">${escapeHTML((r.descripcion || '').slice(0,140))}${(r.descripcion?.length > 140) ? '…' : ''}</p>
      <div class="rc-meta">
        <span class="rc-tag">${escapeHTML(TIPO_LABEL[r.tipo] || r.tipo)}</span>
        ${r.urgencia ? `<span class="rc-tag ${urgClass}">${escapeHTML(URG_LABEL[r.urgencia] || r.urgencia)}</span>` : ''}
      </div>
      <div class="rc-foot">
        <span class="rc-loc">${escapeHTML(r.direccion || '—')}</span>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="rc-quotes${hasQuotes ? ' has-quotes' : ''}">${r.quotesCount} presupuesto${r.quotesCount === 1 ? '' : 's'}</span>
          <span class="req-card-cta">Ver <span class="mini-arrow"></span></span>
        </div>
      </div>
    </article>
  `;
}

/* ── Logout ──────────────────────────────────────────── */
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
function escapeHTML(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
