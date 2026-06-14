/* client-solicitud.js — Detalle de solicitud + presupuestos para el cliente */

const sb = window.supabase_client;

const STATUS_DB_TO_UI = {
  pending:   { key: 'pendiente', label: 'Pendiente' },
  quoted:    { key: 'cotizando', label: 'Cotizando' },
  active:    { key: 'activo',    label: 'En curso' },
  done:      { key: 'completado', label: 'Finalizada' },
  cancelled: { key: 'cancelado', label: 'Cancelada' }
};
const URG_LABEL = { baja: 'Baja', media: 'Media', alta: 'Urgente' };
const RUBRO_LABELS = {
  plomeria: 'Plomería', gas: 'Gas', electricidad: 'Electricidad',
  albanileria: 'Albañilería', pintura: 'Pintura', carpinteria: 'Carpintería',
  herreria: 'Herrería', jardineria: 'Jardinería', 'multi-gremio': 'Multi-gremio'
};
const TIPO_LABEL = { refaccion: 'Refacción', 'obra-nueva': 'Obra Nueva' };
const TICONS = {
  ok:   '<path d="M20 6L9 17l-5-5"/>',
  err:  '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 11v5"/>'
};

let MY_REQ = null;
let REQ_ID = null;

function getSession() {
  try {
    const s = localStorage.getItem('bricko-session') || sessionStorage.getItem('bricko-session');
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session || !session.userId) { window.location.replace('index.html'); return; }
  if (session.role === 'profesional') { window.location.replace('pro.html'); return; }

  REQ_ID = new URLSearchParams(window.location.search).get('req');
  if (!REQ_ID) { window.location.replace('client.html'); return; }

  loadUserUI(session);
  initLogout();
  initCursorGlow();

  const req = await loadRequest(REQ_ID, session.userId);
  if (!req) {
    toast('err', 'No encontrada', 'Volviendo al dashboard…');
    setTimeout(() => window.location.replace('client.html'), 2200);
    return;
  }

  MY_REQ = req;
  renderDetail(req);

  const quotes = await loadQuotes(REQ_ID);
  renderQuotes(quotes, req, session);
});

/* ── Cargar solicitud (verificando propiedad) ──────────── */
async function loadRequest(reqId, userId) {
  try {
    const { data, error } = await sb
      .from('requests')
      .select('id, ticket_id, tipo, rubros, titulo, descripcion, urgencia, direccion, status, etapa, tipo_construccion, superficie, created_at')
      .eq('id', reqId)
      .eq('user_id', userId)
      .single();
    if (error || !data) return null;
    return normalize(data);
  } catch (e) { return null; }
}

/* ── Cargar presupuestos con info del profesional ──────── */
async function loadQuotes(reqId) {
  try {
    const { data } = await sb
      .from('quotes')
      .select('id, request_id, pro_id, amount, description, features, status, created_at, profiles!quotes_pro_id_fkey(first_name, last_name), professionals!quotes_pro_id_fkey(rubro)')
      .eq('request_id', reqId)
      .order('created_at', { ascending: false });
    return data || [];
  } catch (e) { return []; }
}

function normalize(row) {
  const st = STATUS_DB_TO_UI[row.status] || { key: row.status, label: row.status };
  return {
    id: row.id,
    ticketId: row.ticket_id || ('BX-' + row.id?.slice(0, 4)),
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
    statusKey: st.key,
    statusLabel: st.label,
    createdAt: row.created_at
  };
}

function generateTitle(row) {
  if (row.tipo === 'refaccion' && row.rubros?.length)
    return row.rubros.map(r => RUBRO_LABELS[r] || r).join(' + ') + ' — Solicitud';
  if (row.tipo === 'obra-nueva')
    return (row.tipo_construccion
      ? row.tipo_construccion.charAt(0).toUpperCase() + row.tipo_construccion.slice(1)
      : 'Obra Nueva') + ' — Obra Nueva';
  return TIPO_LABEL[row.tipo] || 'Solicitud';
}

/* ── Render: detalle de la solicitud ──────────────────── */
function renderDetail(r) {
  const container = document.getElementById('solicitudDetail');
  if (!container) return;

  const urgClass = 'urg-' + (r.urgencia || 'media');
  const obraClass = r.tipo === 'obra-nueva' ? ' t-obra' : '';

  const extraRows = [];
  if (r.superficie) extraRows.push(`<div class="detail-row"><span class="dk">Superficie</span><span class="dv">${escapeHTML(String(r.superficie))} m²</span></div>`);
  if (r.tipoConstruccion) extraRows.push(`<div class="detail-row"><span class="dk">Tipo</span><span class="dv">${escapeHTML(r.tipoConstruccion)}</span></div>`);
  if (r.etapa) extraRows.push(`<div class="detail-row"><span class="dk">Etapa</span><span class="dv">${escapeHTML(r.etapa)}</span></div>`);

  container.innerHTML = `
    <div class="sol-head">
      <span class="eyebrow">SOLICITUD ${escapeHTML(r.ticketId)}</span>
      <h1 class="sol-title">${escapeHTML(r.titulo)}</h1>
      <div class="sol-tags">
        <span class="sol-tag${obraClass}">${escapeHTML(TIPO_LABEL[r.tipo] || r.tipo)}</span>
        ${r.urgencia ? `<span class="sol-tag ${urgClass}">${escapeHTML(URG_LABEL[r.urgencia] || r.urgencia)}</span>` : ''}
        <span class="req-status ${r.statusKey}">${escapeHTML(r.statusLabel)}</span>
      </div>
    </div>

    ${r.descripcion ? `
    <hr class="sol-divider" />
    <div class="sol-section">
      <div class="sol-section-label">DESCRIPCIÓN</div>
      <p class="sol-desc">${escapeHTML(r.descripcion)}</p>
    </div>` : ''}

    <hr class="sol-divider" />
    <div class="sol-section">
      <div class="sol-section-label">DETALLES</div>
      <div class="detail-grid">
        <div class="detail-row"><span class="dk">Dirección</span><span class="dv">${escapeHTML(r.direccion || '—')}</span></div>
        <div class="detail-row"><span class="dk">Urgencia</span><span class="dv">${escapeHTML(URG_LABEL[r.urgencia] || '—')}</span></div>
        <div class="detail-row"><span class="dk">Publicado</span><span class="dv">${timeAgo(r.createdAt)}</span></div>
        ${extraRows.join('')}
      </div>
    </div>
  `;
}

/* ── Render: lista de presupuestos ────────────────────── */
function renderQuotes(quotes, req, session) {
  const section = document.getElementById('quotesSection');
  const list = document.getElementById('quotesList');
  const countEl = document.getElementById('quotesCount');

  if (!section || !list) return;
  section.style.display = '';

  if (countEl) {
    const n = quotes.length;
    countEl.textContent = n + ' presupuesto' + (n === 1 ? '' : 's');
  }

  if (!quotes.length) {
    list.innerHTML = `
      <div class="quotes-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p>Todavía no recibiste presupuestos.</p>
        <span>Los profesionales de tu zona están revisando tu solicitud.</span>
      </div>
    `;
    return;
  }

  const hasAccepted = quotes.some(q => q.status === 'accepted');
  list.innerHTML = quotes.map(q => quoteCardHTML(q, hasAccepted)).join('');

  list.querySelectorAll('[data-accept]').forEach(btn => {
    btn.addEventListener('click', () => acceptQuote(btn.dataset.accept, req.id));
  });
  list.querySelectorAll('[data-reject]').forEach(btn => {
    btn.addEventListener('click', () => rejectQuote(btn.dataset.reject, req.id));
  });
}

function quoteCardHTML(q, hasAccepted) {
  const proFirst = q.profiles?.first_name || '';
  const proLast = q.profiles?.last_name?.[0] ? q.profiles.last_name[0] + '.' : '';
  const proName = (proFirst + ' ' + proLast).trim() || 'Profesional';
  const proInitials = (proFirst?.[0] || 'P').toUpperCase();
  const rubro = RUBRO_LABELS[q.professionals?.rubro] || q.professionals?.rubro || '—';
  const fmt = Number(q.amount).toLocaleString('es-AR');
  const plazo = q.features?.[0] || null;
  const isAccepted = q.status === 'accepted';
  const isRejected = q.status === 'rejected';

  let cardClass = 'quote-card';
  if (isAccepted) cardClass += ' accepted';
  if (isRejected) cardClass += ' rejected';

  const ribbon = isAccepted
    ? `<div class="qc-accepted-ribbon">✓ Presupuesto aceptado</div>`
    : '';

  let actions = '';
  if (!isAccepted && !isRejected && !hasAccepted) {
    actions = `
      <div class="qc-actions">
        <button class="qc-btn-primary" data-accept="${escapeHTML(q.id)}">Aceptar presupuesto</button>
        <button class="qc-btn-secondary" data-reject="${escapeHTML(q.id)}">Rechazar</button>
      </div>`;
  } else if (isRejected) {
    actions = `
      <div class="qc-actions">
        <span style="font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--muted-2);text-transform:uppercase;padding:10px 18px">Rechazado</span>
      </div>`;
  } else if (!isAccepted && hasAccepted) {
    actions = `
      <div class="qc-actions">
        <span style="font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--muted-2);text-transform:uppercase;padding:10px 18px">Otro presupuesto fue aceptado</span>
      </div>`;
  }

  return `
    <div class="${cardClass}">
      ${ribbon}
      <div class="qc-header">
        <div class="qc-av">${escapeHTML(proInitials)}</div>
        <div class="qc-pro-info">
          <strong>${escapeHTML(proName)}</strong>
          <span>${escapeHTML(rubro)}</span>
        </div>
        <div class="qc-monto">$ ${escapeHTML(fmt)}</div>
      </div>
      <div class="qc-body">
        ${plazo ? `<span class="qc-plazo">PLAZO: ${escapeHTML(plazo)}</span>` : ''}
        ${q.description ? `<p>${escapeHTML(q.description)}</p>` : ''}
      </div>
      ${actions}
    </div>
  `;
}

/* ── Aceptar / rechazar ────────────────────────────────── */
async function acceptQuote(quoteId, reqId) {
  try {
    const { error } = await sb.from('quotes').update({ status: 'accepted' }).eq('id', quoteId);
    if (error) throw error;
    await sb.from('requests').update({ status: 'active' }).eq('id', reqId);
    toast('ok', 'Presupuesto aceptado', 'El profesional fue notificado.');
    const quotes = await loadQuotes(reqId);
    renderQuotes(quotes, MY_REQ, getSession());
  } catch (err) {
    console.error('Error aceptando quote:', err);
    toast('err', 'Error', 'No pudimos procesar la acción.');
  }
}

async function rejectQuote(quoteId, reqId) {
  try {
    const { error } = await sb.from('quotes').update({ status: 'rejected' }).eq('id', quoteId);
    if (error) throw error;
    toast('ok', 'Presupuesto rechazado', 'El presupuesto fue descartado.');
    const quotes = await loadQuotes(reqId);
    renderQuotes(quotes, MY_REQ, getSession());
  } catch (err) {
    console.error('Error rechazando quote:', err);
    toast('err', 'Error', 'No pudimos procesar la acción.');
  }
}

/* ── UI: usuario en el nav ─────────────────────────────── */
function loadUserUI(session) {
  const name = ((session.firstName || '') + ' ' + (session.lastName || '')).trim()
    || session.email?.split('@')[0] || 'Usuario';
  const initials = (session.firstName?.[0] || name[0] || 'U').toUpperCase();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('userAv', initials);
  set('userNm', session.firstName || name);
}

function initLogout() {
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    try { await Auth.logout(); } catch (e) {
      localStorage.removeItem('bricko-session');
      sessionStorage.removeItem('bricko-session');
      localStorage.removeItem('bricko-user');
      window.location.replace('index.html');
    }
  });
}

/* ── Toast ─────────────────────────────────────────────── */
function toast(type, title, msg) {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'ok' ? 'ok' : type === 'err' ? 'err' : '');
  el.innerHTML = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor">${TICONS[type] || TICONS.info}</svg><div><div class="t">${escapeHTML(title)}</div><div class="m">${escapeHTML(msg)}</div></div>`;
  stack.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 4200);
}

/* ── Cursor glow ───────────────────────────────────────── */
function initCursorGlow() {
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

/* ── Helpers ───────────────────────────────────────────── */
function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'hace ' + h + ' h';
  const days = Math.floor(h / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return 'hace ' + days + ' días';
  return d.toLocaleDateString('es-AR');
}

function escapeHTML(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
