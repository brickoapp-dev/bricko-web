/* client-dashboard.js — Dashboard del cliente
   Carga real desde Supabase, filtrado por user_id, status mapping a UI español. */

const sb = window.supabase_client;

/* ── Mapeos UI ───────────────────────────────────────── */
const STATUS_DB_TO_UI = {
  pending:  { key: 'pendiente', label: 'Pendiente' },
  quoted:   { key: 'cotizando', label: 'Cotizando' },
  active:   { key: 'activo',    label: 'En curso' },
  done:     { key: 'completado', label: 'Finalizada' },
  cancelled:{ key: 'cancelado', label: 'Cancelada' }
};
const URG_LABEL = { baja:'Baja', media:'Media', alta:'Urgente' };
const RUBRO_LABELS = {
  plomeria:'Plomería', gas:'Gas', electricidad:'Electricidad',
  albanileria:'Albañilería', pintura:'Pintura', carpinteria:'Carpintería',
  herreria:'Herrería', jardineria:'Jardinería', 'multi-gremio':'Multi-gremio'
};
const TIPO_LABEL = { refaccion:'Refacción', 'obra-nueva':'Obra Nueva' };

/* ── Estado ──────────────────────────────────────────── */
let MY_REQUESTS = [];
let FILTER = 'all';
let SORT = 'fecha';

/* ── Session ─────────────────────────────────────────── */
function getSession(){
  try {
    const s = localStorage.getItem('bricko-session') || sessionStorage.getItem('bricko-session');
    return s ? JSON.parse(s) : null;
  } catch(e){ return null; }
}

/* ── Init ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session || !session.userId){
    window.location.replace('index.html');
    return;
  }
  if (session.role === 'profesional'){
    window.location.replace('pro.html');
    return;
  }

  loadUserUI(session);
  initActionCards();
  initFilters();
  initSort();
  initLogout();
  initDetailDrawer();

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

/* ── Action cards (Refacción / Obra Nueva) ───────────── */
function initActionCards(){
  document.getElementById('cardRefaccion')?.addEventListener('click', () => {
    window.location.href = 'solicitud-refaccion.html';
  });
  document.getElementById('cardObra')?.addEventListener('click', () => {
    window.location.href = 'solicitud-obra.html';
  });
}

/* ── Carga de solicitudes del cliente ────────────────── */
async function loadRequests(userId){
  const grid = document.getElementById('requestsGrid');
  const empty = document.getElementById('emptyRequests');
  const countEl = document.getElementById('reqCount');

  try {
    const { data, error } = await sb
      .from('requests')
      .select('id, ticket_id, tipo, rubros, titulo, descripcion, urgencia, direccion, status, etapa, tipo_construccion, superficie, created_at, quotes(count)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error){
      console.error('Error cargando solicitudes:', error);
      MY_REQUESTS = [];
    } else {
      MY_REQUESTS = (data || []).map(normalize);
    }
  } catch(err){
    console.error('Excepción cargando solicitudes:', err);
    MY_REQUESTS = [];
  }

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
  if (row.tipo === 'refaccion' && row.rubros?.length){
    return row.rubros.map(r => RUBRO_LABELS[r] || r).join(' + ') + ' — Solicitud';
  }
  if (row.tipo === 'obra-nueva'){
    return (row.tipo_construccion
      ? row.tipo_construccion.charAt(0).toUpperCase() + row.tipo_construccion.slice(1)
      : 'Obra Nueva') + ' — Obra Nueva';
  }
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
  sel.addEventListener('change', () => {
    SORT = sel.value;
    render();
  });
}

function render(){
  const grid = document.getElementById('requestsGrid');
  const empty = document.getElementById('emptyRequests');
  if (!grid) return;

  let list = [...MY_REQUESTS];

  if (FILTER !== 'all'){
    list = list.filter(r => r.statusKey === FILTER);
  }
  if (SORT === 'urgencia'){
    const order = { alta: 0, media: 1, baja: 2 };
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
    card.addEventListener('click', () => openDetail(card.dataset.req));
  });
}

function cardHTML(r){
  const urgClass = 'urg-' + (r.urgencia || 'media');
  const stClass = 's-' + r.statusKey;
  return `
    <article class="req-card ${stClass}" data-req="${r.id}" tabindex="0">
      <div class="rc-head">
        <span class="rc-id">${escapeHTML(r.ticketId)}</span>
        <span class="rc-status">${escapeHTML(r.statusLabel)}</span>
      </div>
      <h3 class="rc-title">${escapeHTML(r.titulo)}</h3>
      <p class="rc-desc">${escapeHTML((r.descripcion || '').slice(0, 140))}${(r.descripcion?.length > 140) ? '…' : ''}</p>
      <div class="rc-meta">
        <span class="rc-tag">${escapeHTML(TIPO_LABEL[r.tipo] || r.tipo)}</span>
        <span class="rc-tag ${urgClass}">${escapeHTML(URG_LABEL[r.urgencia] || r.urgencia)}</span>
      </div>
      <div class="rc-foot">
        <span class="rc-loc">${escapeHTML(r.direccion || '—')}</span>
        <span class="rc-quotes">${r.quotesCount} presupuesto${r.quotesCount === 1 ? '' : 's'}</span>
      </div>
    </article>
  `;
}

/* ── Detail drawer ───────────────────────────────────── */
function initDetailDrawer(){
  document.getElementById('dpClose')?.addEventListener('click', closeDetail);
  document.getElementById('detailOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'detailOverlay') closeDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });
}

async function openDetail(reqId){
  const req = MY_REQUESTS.find(r => r.id === reqId);
  if (!req) return;

  const idEl = document.getElementById('dpId');
  const contentEl = document.getElementById('dpContent');
  const overlay = document.getElementById('detailOverlay');
  if (!contentEl || !overlay) return;

  if (idEl) idEl.textContent = 'REQ / ' + req.ticketId;
  contentEl.innerHTML = `
    <div class="dp-section">
      <span class="dp-eyebrow">Estado</span>
      <h2 class="dp-title">${escapeHTML(req.titulo)}</h2>
      <span class="dp-status s-${req.statusKey}">${escapeHTML(req.statusLabel)}</span>
    </div>
    <div class="dp-section">
      <span class="dp-eyebrow">Detalle</span>
      <p class="dp-text">${escapeHTML(req.descripcion || '—')}</p>
    </div>
    <div class="dp-grid">
      <div class="dp-row"><span class="dk">Tipo</span><span class="dv">${escapeHTML(TIPO_LABEL[req.tipo] || req.tipo)}</span></div>
      <div class="dp-row"><span class="dk">Urgencia</span><span class="dv">${escapeHTML(URG_LABEL[req.urgencia] || req.urgencia)}</span></div>
      <div class="dp-row"><span class="dk">Dirección</span><span class="dv">${escapeHTML(req.direccion || '—')}</span></div>
      ${req.superficie ? `<div class="dp-row"><span class="dk">Superficie</span><span class="dv">${req.superficie} m²</span></div>` : ''}
      ${req.etapa ? `<div class="dp-row"><span class="dk">Etapa</span><span class="dv">${escapeHTML(req.etapa)}</span></div>` : ''}
    </div>
    <div class="dp-section" id="dpQuotes">
      <span class="dp-eyebrow">Presupuestos recibidos</span>
      <div class="dp-quotes-list">Cargando...</div>
    </div>
  `;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  loadQuotesForRequest(req.id);
}

function closeDetail(){
  const overlay = document.getElementById('detailOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

async function loadQuotesForRequest(requestId){
  const container = document.querySelector('#dpQuotes .dp-quotes-list');
  if (!container) return;

  try {
    const { data, error } = await sb
      .from('quotes')
      .select('id, amount, description, features, status, created_at, pro_id, profiles!quotes_pro_id_fkey(first_name, last_name), professionals!quotes_pro_id_fkey(rubro, rating, jobs_completed)')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false });

    if (error){
      console.warn('Error cargando quotes:', error);
      container.innerHTML = '<p class="dp-empty">No se pudieron cargar los presupuestos.</p>';
      return;
    }

    if (!data || !data.length){
      container.innerHTML = '<p class="dp-empty">Todavía no recibiste presupuestos. Los profesionales suelen responder en menos de 24h.</p>';
      return;
    }

    container.innerHTML = data.map(q => {
      const proName = ((q.profiles?.first_name || '') + ' ' + (q.profiles?.last_name || '')).trim() || 'Profesional';
      const rubro = RUBRO_LABELS[q.professionals?.rubro] || q.professionals?.rubro || '—';
      const rating = q.professionals?.rating ?? '—';
      const accepted = q.status === 'accepted';
      const rejected = q.status === 'rejected';
      return `
        <div class="dp-quote ${accepted ? 'accepted' : ''} ${rejected ? 'rejected' : ''}">
          <div class="dpq-head">
            <div>
              <strong>${escapeHTML(proName)}</strong>
              <span class="dpq-rubro">${escapeHTML(rubro)}</span>
            </div>
            <div class="dpq-amount">$ ${Number(q.amount || 0).toLocaleString('es-AR')}</div>
          </div>
          <p class="dpq-desc">${escapeHTML(q.description || '')}</p>
          <div class="dpq-foot">
            <span>★ ${rating}</span>
            ${!accepted && !rejected ? `
              <button class="dpq-accept" data-quote="${q.id}" data-request="${requestId}">Aceptar</button>
              <button class="dpq-reject" data-quote="${q.id}">Rechazar</button>
            ` : (accepted ? '<span class="dpq-tag accepted">Aceptado</span>' : '<span class="dpq-tag rejected">Rechazado</span>')}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.dpq-accept').forEach(btn => {
      btn.addEventListener('click', () => acceptQuote(btn.dataset.quote, btn.dataset.request));
    });
    container.querySelectorAll('.dpq-reject').forEach(btn => {
      btn.addEventListener('click', () => rejectQuote(btn.dataset.quote));
    });
  } catch(err){
    console.error('Excepción cargando quotes:', err);
    container.innerHTML = '<p class="dp-empty">No se pudieron cargar los presupuestos.</p>';
  }
}

async function acceptQuote(quoteId, requestId){
  if (!confirm('¿Aceptar este presupuesto? Se rechazarán los demás automáticamente.')) return;
  try {
    // Marcar quote como accepted
    await sb.from('quotes').update({ status: 'accepted' }).eq('id', quoteId);
    // Rechazar los hermanos
    await sb.from('quotes').update({ status: 'rejected' }).eq('request_id', requestId).neq('id', quoteId);
    // Marcar request como active
    await sb.from('requests').update({ status: 'active' }).eq('id', requestId);
    // Recargar
    const session = getSession();
    await loadRequests(session.userId);
    loadQuotesForRequest(requestId);
  } catch(err){
    console.error('Error aceptando:', err);
    alert('No pudimos aceptar el presupuesto.');
  }
}
async function rejectQuote(quoteId){
  try {
    await sb.from('quotes').update({ status: 'rejected' }).eq('id', quoteId);
    const overlay = document.getElementById('detailOverlay');
    const reqId = MY_REQUESTS.find(r => document.getElementById('dpId')?.textContent.includes(r.ticketId))?.id;
    if (reqId) loadQuotesForRequest(reqId);
  } catch(err){
    console.error('Error rechazando:', err);
  }
}

/* ── Logout ──────────────────────────────────────────── */
function initLogout(){
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    try {
      await Auth.logout();
    } catch(e){
      localStorage.removeItem('bricko-session');
      sessionStorage.removeItem('bricko-session');
      localStorage.removeItem('bricko-user');
      window.location.replace('index.html');
    }
  });
}

/* ── Helpers ─────────────────────────────────────────── */
function escapeHTML(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
