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
  initThemeToggle();
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

  if (req.status === 'active' || req.status === 'done') {
    initObraSection();
    await loadObraSection();
  }
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
    const { data, error } = await sb
      .from('quotes')
      .select('id, request_id, pro_id, amount, description, features, status, created_at, professionals!quotes_pro_id_fkey(rubro)')
      .eq('request_id', reqId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('Aviso cargando presupuestos:', error); return []; }

    const quotes = data || [];
    if (quotes.length) {
      // profiles tiene RLS "solo propio perfil": se usa una función
      // SECURITY DEFINER que solo expone estos datos de pros que cotizaron
      // en solicitudes del usuario actual — ver migración
      // 20260817120000_fix_client_quote_visibility.sql
      const { data: proProfiles, error: profErr } = await sb
        .rpc('get_quote_professionals', { p_request_ids: [reqId] });
      if (profErr) console.warn('Aviso cargando perfiles de profesionales:', profErr);
      const profileById = {};
      (proProfiles || []).forEach(p => { profileById[p.pro_id] = p; });
      quotes.forEach(q => { q.profiles = profileById[q.pro_id] || null; });
    }
    return quotes;
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
    descripcion: (row.descripcion || '').split('[ArchivosJSON:')[0].trim(),
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
    // Aceptación atómica en el backend (rechaza el resto + pone la obra en curso).
    const { error } = await sb.rpc('accept_quote', { p_quote_id: quoteId });
    if (error) throw error;
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

/* ── Obra en curso: hitos / equipo / pagos / documentos ─── */
const MILESTONE_STATUS_LABEL = { pending: 'Pendiente', in_progress: 'En curso', review: 'A revisar', done: 'Finalizado' };
const MILESTONE_STATUS_CLASS = { pending: '', in_progress: 'orange', review: 'warn', done: 'ok' };
const PAGO_LABEL = { pending: 'Pendiente', approved: 'Aprobado', paid: 'Pagado' };
const PAGO_CLASS = { pending: '', approved: 'warn', paid: 'ok' };
const MODALIDAD_LABEL = {
  contratista: 'Contratista', colaborador_independiente: 'Colaborador independiente',
  dependiente: 'Dependiente', subcontratista: 'Subcontratista', profesional: 'Profesional'
};
const MODALIDAD_ROLE_CLASS = {
  contratista: 'contratista', colaborador_independiente: 'padic',
  dependiente: 'dep', subcontratista: 'sub', profesional: 'pro'
};
const DOC_TIPO_LABEL = { contrato: 'Contrato marco de obra', anexo: 'Anexo', evidencia: 'Evidencia de avance', factura: 'Factura' };

const OBRA = { hitos: [], participantes: [], documentos: [], prep: null };

function initObraSection() {
  document.getElementById('obraTabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-obra-tab]');
    if (!tab) return;
    const name = tab.dataset.obraTab;
    document.querySelectorAll('[data-obra-tab]').forEach(b => b.classList.toggle('active', b === tab));
    document.querySelectorAll('[data-obra-panel]').forEach(p => { p.hidden = p.dataset.obraPanel !== name; });
  });

  document.getElementById('obraHitos')?.addEventListener('click', async (e) => {
    const approve = e.target.closest('[data-approve-hito]');
    if (approve) {
      const { error } = await sb.rpc('approve_milestone', { p_hito_id: approve.dataset.approveHito });
      if (error) { toast('err', 'No se pudo aprobar', error.message); return; }
      toast('ok', 'Avance aprobado', 'El profesional ya puede facturar este hito.');
      await loadObraSection();
      return;
    }
    const markPaid = e.target.closest('[data-mark-paid]');
    if (markPaid) {
      const { error } = await sb.rpc('mark_milestone_paid', { p_hito_id: markPaid.dataset.markPaid });
      if (error) { toast('err', 'No se pudo marcar como pagado', error.message); return; }
      toast('ok', 'Hito marcado como pagado', '');
      await loadObraSection();
      return;
    }
  });

  document.getElementById('obraDocumentos')?.addEventListener('click', (e) => {
    if (e.target.closest('#btnCopyObraLink')) {
      const input = document.getElementById('obraShareLink');
      input.select();
      navigator.clipboard?.writeText(input.value).then(() => toast('ok', 'Copiado', 'Link de la obra copiado.')).catch(() => {});
    }
  });

  document.getElementById('obraPagos')?.addEventListener('click', async (e) => {
    if (!e.target.closest('#btnFinishObra')) return;
    const { error } = await sb.rpc('finish_obra', { p_request_id: REQ_ID });
    if (error) { toast('err', 'No se pudo finalizar', error.message); return; }
    toast('ok', 'Obra finalizada', 'Quedó registrada como completada.');
    if (MY_REQ) MY_REQ.status = 'done';
    await loadObraSection();
  });
}

async function loadObraSection() {
  const section = document.getElementById('obraSection');
  if (!section) return;
  section.style.display = '';

  const { data: hitos } = await sb.from('hitos').select('*').eq('request_id', REQ_ID).order('numero', { ascending: true });
  OBRA.hitos = hitos || [];

  let participantes = [];
  if (OBRA.hitos.length) {
    const { data: parts } = await sb.from('hito_participantes').select('*').in('hito_id', OBRA.hitos.map(h => h.id)).order('created_at', { ascending: true });
    participantes = parts || [];
  }
  OBRA.participantes = participantes;

  const { data: documentos } = await sb.from('obra_documentos').select('*').eq('request_id', REQ_ID).order('created_at', { ascending: false });
  OBRA.documentos = documentos || [];

  const { data: prep } = await sb.from('obra_preparacion').select('gate_habilitada').eq('request_id', REQ_ID).maybeSingle();
  OBRA.prep = prep;

  renderObraHitos();
  renderObraEquipo();
  renderObraPagos();
  renderObraDocumentos();
}

function renderObraHitos() {
  const el = document.getElementById('obraHitos');
  if (!el) return;

  if (OBRA.prep && !OBRA.prep.gate_habilitada) {
    el.innerHTML = '<p class="pj-small">El profesional todavía está preparando la obra (definiendo hitos y equipo). Vas a poder seguir el avance apenas la habilite.</p>';
    return;
  }
  if (!OBRA.hitos.length) {
    el.innerHTML = '<p class="pj-small">Todavía no hay hitos definidos.</p>';
    return;
  }

  el.innerHTML = `<div class="pj-milestones">${OBRA.hitos.map(h => `
    <article class="pj-milestone">
      <div class="pj-milestone-head">
        <div class="pj-milestone-num">${String(h.numero).padStart(2, '0')}</div>
        <div><h3>${escapeHTML(h.titulo)}</h3><div class="pj-small">${escapeHTML(h.descripcion || '')}</div></div>
        <span class="pj-status ${MILESTONE_STATUS_CLASS[h.status] || ''}">${MILESTONE_STATUS_LABEL[h.status] || h.status}</span>
      </div>
      <div class="pj-milestone-body">
        <div class="pj-milestone-meta">
          <div><small>Monto</small><strong>$ ${money(h.monto)}</strong></div>
          <div><small>Avance</small><strong>${h.avance_pct}%</strong></div>
          <div><small>Pago</small><strong>${PAGO_LABEL[h.pago_estado] || h.pago_estado}</strong></div>
          <div><small>Nota del profesional</small><strong>${escapeHTML(h.avance_nota || '—')}</strong></div>
        </div>
        <div class="pj-progress-track"><div class="pj-progress-fill" style="width:${h.avance_pct}%"></div></div>
        <div class="pj-actions" style="justify-content:flex-start;margin-top:15px">
          ${h.status === 'review' ? `<button class="pj-btn primary" data-approve-hito="${h.id}">Aprobar avance</button>` : ''}
          ${h.status === 'done' && h.pago_estado === 'approved' ? `<button class="pj-btn primary" data-mark-paid="${h.id}">Marcar como pagado</button>` : ''}
        </div>
      </div>
    </article>
  `).join('')}</div>`;
}

function renderObraEquipo() {
  const el = document.getElementById('obraEquipo');
  if (!el) return;
  if (!OBRA.participantes.length) {
    el.innerHTML = '<p class="pj-small">Todavía no hay equipo asignado a los hitos.</p>';
    return;
  }
  const hitoById = {};
  OBRA.hitos.forEach(h => { hitoById[h.id] = h; });
  el.innerHTML = `<div class="pj-table-wrap"><table class="pj-table">
    <thead><tr><th>Hito</th><th>Responsable</th><th>Modalidad</th><th>Nota</th><th>Estado</th></tr></thead>
    <tbody>${OBRA.participantes.map(p => {
      const h = hitoById[p.hito_id];
      return `<tr>
        <td><strong>${h ? String(h.numero).padStart(2, '0') + ' · ' + escapeHTML(h.titulo) : '—'}</strong><small>${escapeHTML(p.especialidad || '')}</small></td>
        <td>${escapeHTML(p.nombre)}</td>
        <td><span class="pj-role ${MODALIDAD_ROLE_CLASS[p.modalidad] || ''}">${MODALIDAD_LABEL[p.modalidad] || p.modalidad}</span></td>
        <td><small>${escapeHTML(p.documentacion_nota || '—')}</small></td>
        <td><span class="pj-status ${p.estado === 'vigente' ? 'ok' : 'warn'}">${p.estado === 'vigente' ? 'Vigente' : 'A revisar'}</span></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function renderObraPagos() {
  const el = document.getElementById('obraPagos');
  if (!el) return;
  if (!OBRA.hitos.length) {
    el.innerHTML = '<p class="pj-small">Todavía no hay hitos definidos.</p>';
    return;
  }
  const allDonePaid = OBRA.hitos.every(h => h.status === 'done' && h.pago_estado === 'paid');
  const obraDone = MY_REQ?.status === 'done';

  el.innerHTML = `<div class="pj-table-wrap"><table class="pj-table">
    <thead><tr><th>Hito</th><th>Monto</th><th>Estado</th><th>Fecha</th></tr></thead>
    <tbody>${OBRA.hitos.map(h => `
      <tr>
        <td><strong>${String(h.numero).padStart(2, '0')} · ${escapeHTML(h.titulo)}</strong></td>
        <td>$ ${money(h.monto)}</td>
        <td><span class="pj-status ${PAGO_CLASS[h.pago_estado] || ''}">${PAGO_LABEL[h.pago_estado] || h.pago_estado}</span></td>
        <td>${h.fecha_estimada ? new Date(h.fecha_estimada + 'T00:00:00').toLocaleDateString('es-AR') : '—'}</td>
      </tr>
    `).join('')}</tbody>
  </table></div>
  ${obraDone
    ? `<div class="pj-notice-product" style="margin-top:16px"><h3>Obra finalizada.</h3><p>Todos los hitos fueron completados y pagados.</p></div>`
    : allDonePaid
      ? `<div class="pj-gate-footer" style="border:0;margin-top:16px;padding-top:0"><span class="pj-status ok">Todos los hitos pagados</span><button class="pj-btn primary" id="btnFinishObra">Dar por finalizada la obra</button></div>`
      : ''}`;
}

function renderObraDocumentos() {
  const el = document.getElementById('obraDocumentos');
  if (!el) return;

  const docsHTML = OBRA.documentos.length
    ? OBRA.documentos.map(d => `
        <div class="pj-doc-row">
          <div><strong>${escapeHTML(d.nombre || DOC_TIPO_LABEL[d.tipo] || d.tipo)}</strong><small>${DOC_TIPO_LABEL[d.tipo] || d.tipo}</small></div>
          <span class="pj-status ${d.estado === 'firmado' || d.estado === 'vigente' ? 'ok' : d.estado === 'borrador' ? 'warn' : ''}">${d.estado}</span>
        </div>
      `).join('')
    : '<p class="pj-small">Todavía no hay documentos cargados.</p>';

  el.innerHTML = `
    <div class="pj-doc-grid">
      <section class="pj-panel pj-panel-pad">
        <div class="pj-kicker">Documentos de la obra</div>
        <div style="margin-top:8px">${docsHTML}</div>
      </section>
      <aside class="pj-panel pj-panel-pad">
        <div class="pj-kicker">Acceso a la obra</div>
        <p class="pj-small" style="margin-top:10px">Compartí este link para que cualquiera con acceso siga hitos, avance y pagos.</p>
        <div class="pj-share-box"><input type="text" id="obraShareLink" readonly value="${escapeHTML(window.location.origin + '/client-solicitud.html?req=' + REQ_ID)}" /><button class="pj-btn" id="btnCopyObraLink">Copiar</button></div>
      </aside>
    </div>
  `;
}

function money(n) { return Number(n || 0).toLocaleString('es-AR'); }
