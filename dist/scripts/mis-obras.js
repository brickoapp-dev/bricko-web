/* mis-obras.js — Lógica para la pantalla Mis Obras
   Manejo de solicitudes de cliente, visualización extendida y presupuestos recibidos de contratistas. */

const sb = window.supabase_client;

const STATUS_MAP = {
  pending:   { key: 'pending',   label: 'Pendiente',   class: 'st-pending' },
  quoted:    { key: 'quoted',    label: 'Cotizando',   class: 'st-quoted' },
  active:    { key: 'active',    label: 'En curso',    class: 'st-active' },
  done:      { key: 'done',      label: 'Finalizada',  class: 'st-done' },
  cancelled: { key: 'cancelled', label: 'Cancelada',   class: 'st-cancelled' }
};

const URG_LABELS = {
  baja: 'Sin apuro',
  media: 'Este mes',
  alta: 'Urgente'
};

const RUBRO_LABELS = {
  albanileria: 'Albañilería',
  plomeria: 'Plomería',
  electricidad: 'Electricidad',
  gas: 'Gas',
  terminaciones: 'Terminaciones',
  exteriores: 'Exteriores',
  'limpieza-transporte': 'Limpieza y transporte',
  'diseno-planificacion': 'Diseño y Planificación',
  pintura: 'Pintura', carpinteria: 'Carpintería', herreria: 'Herrería', jardineria: 'Jardinería',
  'multi-gremio': 'Multi-gremio'
};

const TICONS = {
  ok:   '<path d="M20 6L9 17l-5-5"/>',
  err:  '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 11v5"/>'
};

let OBRAS_DATA = [];
let CURRENT_STATUS_FILTER = 'all';
let SEARCH_QUERY = '';
let SORT_OPTION = 'recent';

/* ── Autenticación y Sesión ──────────────────────────── */
function getSession(){
  try {
    const s = localStorage.getItem('bricko-session') || sessionStorage.getItem('bricko-session');
    return s ? JSON.parse(s) : null;
  } catch(e){ return null; }
}

function requireAuth(){
  const session = getSession();
  if (!session || !session.userId){
    window.location.replace('index.html');
    return null;
  }
  if (session.role === 'profesional'){
    window.location.replace('pro.html');
    return null;
  }
  return session;
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = requireAuth();
  if (!session) return;

  loadUserNav(session);
  initLogout();
  initThemeToggle();
  initToolbarEvents();
  initCursorGlow();

  await fetchClientObras(session.userId);
});

/* ── User UI ─────────────────────────────────────────── */
function loadUserNav(session){
  const name = ((session.firstName || '') + ' ' + (session.lastName || '')).trim() || session.email?.split('@')[0] || 'Usuario';
  const initials = (session.firstName?.[0] || name[0] || 'U').toUpperCase();
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('userAv', initials);
  setEl('userNm', session.firstName || name);
}

/* ── Carga de datos desde Supabase ───────────────────── */
async function fetchClientObras(userId){
  const skeleton = document.getElementById('obrasSkeleton');
  const container = document.getElementById('obrasContainer');
  const emptyState = document.getElementById('emptyObras');

  if (skeleton) skeleton.style.display = 'block';
  if (container) container.style.display = 'none';
  if (emptyState) emptyState.style.display = 'none';

  try {
    // 1. Obtener solicitudes del usuario
    const { data: requests, error: reqErr } = await sb
      .from('requests')
      .select('id, ticket_id, tipo, rubros, titulo, descripcion, urgencia, direccion, status, etapa, tipo_construccion, superficie, created_at, fotos')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (reqErr) throw reqErr;

    if (!requests || requests.length === 0){
      OBRAS_DATA = [];
      updateCounters();
      renderObras();
      return;
    }

    const reqIds = requests.map(r => r.id);

    // 2. Obtener presupuestos de estas solicitudes
    const { data: quotes, error: quotesErr } = await sb
      .from('quotes')
      .select('id, request_id, pro_id, amount, description, features, status, created_at, professionals!quotes_pro_id_fkey(rubro)')
      .in('request_id', reqIds)
      .order('created_at', { ascending: false });

    if (quotesErr) console.warn('Aviso cargando presupuestos:', quotesErr);

    // 3. Obtener nombre/apellido de los profesionales que cotizaron
    //    (profiles tiene RLS "solo propio perfil": se usa una función
    //    SECURITY DEFINER que solo expone estos datos de pros que cotizaron
    //    en solicitudes del usuario actual — ver migración
    //    20260817120000_fix_client_quote_visibility.sql)
    if (quotes && quotes.length){
      const { data: proProfiles, error: profErr } = await sb
        .rpc('get_quote_professionals', { p_request_ids: reqIds });
      if (profErr) console.warn('Aviso cargando perfiles de profesionales:', profErr);
      const profileById = {};
      (proProfiles || []).forEach(p => { profileById[p.pro_id] = p; });
      quotes.forEach(q => { q.profiles = profileById[q.pro_id] || null; });
    }

    // Mapear presupuestos por request_id
    const quotesByReq = {};
    (quotes || []).forEach(q => {
      if (!quotesByReq[q.request_id]) quotesByReq[q.request_id] = [];
      quotesByReq[q.request_id].push(q);
    });

    // Construir estructura unificada
    OBRAS_DATA = requests.map(r => normalizeObra(r, quotesByReq[r.id] || []));
    await attachSignedImageUrls(OBRAS_DATA);

    updateCounters();
    renderObras();

  } catch(err){
    console.error('Error al cargar obras:', err);
    toast('err', 'Error de conexión', 'No pudimos cargar tus obras.');
    if (skeleton) skeleton.style.display = 'none';
    if (emptyState) {
      emptyState.style.display = 'block';
      document.getElementById('emptyMsg').textContent = 'Ocurrió un problema al conectar con el servidor.';
    }
  }
}

function normalizeObra(r, quotesList){
  const stInfo = STATUS_MAP[r.status] || { key: r.status, label: r.status, class: 'st-pending' };

  let modoPagoText = 'No especificado';
  let cleanDesc = r.descripcion || '';

  // Extraer modo de pago si está guardado en la descripción
  if (cleanDesc.includes('[Modo de pago:')){
    const match = cleanDesc.match(/\[Modo de pago:\s*([^\]]+)\]/);
    if (match && match[1]){
      modoPagoText = match[1];
    }
    cleanDesc = cleanDesc.replace(/\[Modo de pago:\s*[^\]]+\]/, '').trim();
  }

  // Compat: solicitudes viejas (antes de que las fotos se subieran a
  // Storage) guardaban un JSON de archivos embebido en la descripción.
  // Ya no se parsea (ver fotos[] / attachSignedImageUrls), solo se
  // oculta de la vista.
  if (cleanDesc.includes('[ArchivosJSON:')){
    cleanDesc = cleanDesc.split('[ArchivosJSON:')[0].trim();
  }

  const rubrosArr = (r.rubros || []).map(rub => RUBRO_LABELS[rub] || rub);
  const rubrosText = rubrosArr.length ? rubrosArr.join(', ') : 'Albañilería';

  return {
    id: r.id,
    ticketId: r.ticket_id || ('BX-' + r.id.slice(0,6).toUpperCase()),
    tipo: r.tipo,
    rubros: r.rubros || [],
    rubrosText,
    titulo: r.titulo || (r.tipo === 'obra-nueva' ? 'Obra Nueva' : 'Refacción General'),
    descripcion: cleanDesc,
    urgencia: r.urgencia || 'media',
    urgenciaLabel: URG_LABELS[r.urgencia] || 'Sin apuro',
    direccion: r.direccion || 'No especificada',
    superficie: r.superficie ? `${r.superficie} m²` : 'No especificada',
    modoPago: modoPagoText,
    fotosPaths: r.fotos || [],
    files: [],
    statusKey: stInfo.key,
    statusLabel: stInfo.label,
    statusClass: stInfo.class,
    createdAt: r.created_at,
    quotes: quotesList
  };
}

/* ── Resolver URLs firmadas para las fotos/planos (bucket privado) ──── */
async function attachSignedImageUrls(obras){
  for (const o of obras){
    const paths = o.fotosPaths || [];
    if (!paths.length) continue;
    const resolved = await Promise.all(paths.map(async (path) => {
      try {
        const { data } = await sb.storage.from('solicitudes').createSignedUrl(path, 3600);
        if (!data?.signedUrl) return null;
        return {
          url: data.signedUrl,
          isPdf: /\.pdf$/i.test(path),
          name: path.split('/').pop() || 'Archivo'
        };
      } catch(e){ return null; }
    }));
    o.files = resolved.filter(Boolean);
  }
}

/* ── Actualizar contadores del toolbar ───────────────── */
function updateCounters(){
  const count = {
    all: OBRAS_DATA.length,
    pending: OBRAS_DATA.filter(o => o.statusKey === 'pending').length,
    quoted: OBRAS_DATA.filter(o => o.statusKey === 'quoted' || (o.quotes.length > 0 && o.statusKey === 'pending')).length,
    active: OBRAS_DATA.filter(o => o.statusKey === 'active').length,
    done: OBRAS_DATA.filter(o => o.statusKey === 'done').length
  };

  document.getElementById('countAll').textContent = count.all;
  document.getElementById('countPending').textContent = count.pending;
  document.getElementById('countQuoted').textContent = count.quoted;
  document.getElementById('countActive').textContent = count.active;
  document.getElementById('countDone').textContent = count.done;
}

/* ── Eventos de filtros y búsqueda ───────────────────── */
function initToolbarEvents(){
  // Búsqueda
  const searchInput = document.getElementById('searchInput');
  if (searchInput){
    searchInput.addEventListener('input', (e) => {
      SEARCH_QUERY = e.target.value.toLowerCase().trim();
      renderObras();
    });
  }

  // Filtros de estado
  document.querySelectorAll('#statusFilters .mobras-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#statusFilters .mobras-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      CURRENT_STATUS_FILTER = btn.dataset.status;
      renderObras();
    });
  });

  // Ordenamiento
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect){
    sortSelect.addEventListener('change', (e) => {
      SORT_OPTION = e.target.value;
      renderObras();
    });
  }
}

/* ── Render del listado de obras ─────────────────────── */
function renderObras(){
  const skeleton = document.getElementById('obrasSkeleton');
  const container = document.getElementById('obrasContainer');
  const emptyState = document.getElementById('emptyObras');

  if (skeleton) skeleton.style.display = 'none';

  let filtered = OBRAS_DATA.filter(o => {
    // Filtro de estado
    if (CURRENT_STATUS_FILTER !== 'all'){
      if (CURRENT_STATUS_FILTER === 'quoted'){
        if (o.statusKey !== 'quoted' && !(o.quotes.length > 0 && o.statusKey === 'pending')) return false;
      } else if (o.statusKey !== CURRENT_STATUS_FILTER){
        return false;
      }
    }
    // Filtro de búsqueda
    if (SEARCH_QUERY){
      const q = SEARCH_QUERY;
      const match = o.ticketId.toLowerCase().includes(q) ||
                    o.titulo.toLowerCase().includes(q) ||
                    o.direccion.toLowerCase().includes(q) ||
                    o.rubrosText.toLowerCase().includes(q) ||
                    o.descripcion.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  // Ordenamiento
  if (SORT_OPTION === 'urgencia'){
    const urgMap = { alta: 0, media: 1, baja: 2 };
    filtered.sort((a,b) => (urgMap[a.urgencia] ?? 99) - (urgMap[b.urgencia] ?? 99));
  } else if (SORT_OPTION === 'quotes'){
    filtered.sort((a,b) => b.quotes.length - a.quotes.length);
  } else {
    filtered.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  if (filtered.length === 0){
    container.style.display = 'none';
    emptyState.style.display = 'block';
    if (SEARCH_QUERY || CURRENT_STATUS_FILTER !== 'all'){
      document.getElementById('emptyMsg').textContent = 'No hay obras que coincidan con la búsqueda o filtro seleccionado.';
    } else {
      document.getElementById('emptyMsg').textContent = 'Todavía no tenés solicitudes de obras o refacciones publicadas.';
    }
    return;
  }

  emptyState.style.display = 'none';
  container.style.display = 'grid';
  container.innerHTML = filtered.map(obraCardHTML).join('');

  // Vincular eventos de los botones de presupuestos
  container.querySelectorAll('[data-accept-quote]').forEach(btn => {
    btn.addEventListener('click', () => handleAcceptQuote(btn.dataset.acceptQuote));
  });

  container.querySelectorAll('[data-reject-quote]').forEach(btn => {
    btn.addEventListener('click', () => handleRejectQuote(btn.dataset.rejectQuote));
  });

  // Vincular apertura de imagen al hacer clic
  container.querySelectorAll('.file-thumb-item').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const src = thumb.dataset.imgSrc;
      if (src) openImageModal(src);
    });
  });
}

function renderObraFiles(files){
  if (!files || files.length === 0){
    return `
      <div class="file-thumb-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        <span>Sin fotos o planos adjuntos</span>
      </div>
    `;
  }
  return files.map((f, i) => {
    if (f.isPdf){
      return `
        <a href="${escapeHTML(f.url || '#')}" target="_blank" class="file-thumb-pdf" title="${escapeHTML(f.name || 'PDF')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span>${escapeHTML(f.name || 'Documento PDF')}</span>
        </a>
      `;
    }
    return `
      <div class="file-thumb-item" data-img-src="${escapeHTML(f.url)}" title="Ver imagen ampliada">
        <img src="${escapeHTML(f.url)}" alt="${escapeHTML(f.name || 'Foto ' + (i + 1))}" />
        <div class="file-thumb-overlay">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>
        </div>
      </div>
    `;
  }).join('');
}

function openImageModal(src){
  let modal = document.getElementById('imageModalOverlay');
  if (!modal){
    modal = document.createElement('div');
    modal.id = 'imageModalOverlay';
    modal.className = 'img-modal-overlay';
    modal.innerHTML = `
      <div class="img-modal-content">
        <button class="img-modal-close" id="btnImgModalClose" aria-label="Cerrar">&times;</button>
        <img id="imgModalSrc" src="" alt="Imagen ampliada" />
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.id === 'btnImgModalClose') {
        modal.classList.remove('open');
      }
    });
  }
  document.getElementById('imgModalSrc').src = src;
  modal.classList.add('open');
}

/* ── HTML de cada Tarjeta de Obra ────────────────────── */
function obraCardHTML(o){
  const hasQuotes = o.quotes.length > 0;
  const quotesBadgeClass = hasQuotes ? 'has-quotes' : '';

  // Render de presupuestos recibidos
  let quotesContentHTML = '';
  if (!hasQuotes){
    quotesContentHTML = `
      <div class="quotes-empty-card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <p>Aún no recibiste presupuestos para esta obra.</p>
        <span>Los contratistas calificados de tu zona están evaluando tu proyecto.</span>
      </div>
    `;
  } else {
    const hasAccepted = o.quotes.some(q => q.status === 'accepted');
    quotesContentHTML = `
      <div class="quotes-grid">
        ${o.quotes.map(q => quoteItemHTML(q, hasAccepted)).join('')}
      </div>
    `;
  }

  return `
    <article class="obra-card" data-id="${o.id}">
      <div class="obra-card-head">
        <div class="och-left">
          <span class="ticket-tag">${escapeHTML(o.ticketId)}</span>
          <span class="pub-time">Publicado ${timeAgo(o.createdAt)}</span>
        </div>
        <div class="och-right">
          <span class="obra-status-pill ${o.statusClass}">${escapeHTML(o.statusLabel)}</span>
        </div>
      </div>

      <h2 class="obra-title">${escapeHTML(o.titulo)}</h2>

      <!-- DETALLES DE LA OBRA -->
      <div class="obra-details-grid">
        <div class="od-item">
          <span class="od-label">/03 Rubros</span>
          <span class="od-val">${escapeHTML(o.rubrosText)}</span>
        </div>
        <div class="od-item">
          <span class="od-label">/04 Superficie</span>
          <span class="od-val">${escapeHTML(o.superficie)}</span>
        </div>
        <div class="od-item">
          <span class="od-label">/05 Urgencia</span>
          <span class="od-val urg-${o.urgencia}">${escapeHTML(o.urgenciaLabel)}</span>
        </div>
        <div class="od-item">
          <span class="od-label">/06 Ubicación</span>
          <span class="od-val">${escapeHTML(o.direccion)}</span>
        </div>
        <div class="od-item">
          <span class="od-label">/07 Modo de Pago</span>
          <span class="od-val">${escapeHTML(o.modoPago)}</span>
        </div>
      </div>

      <!-- DESCRIPCIÓN PROYECTO -->
      ${o.descripcion ? `
        <div class="obra-desc-box">
          <span class="od-label">/02 Descripción del proyecto</span>
          <p>${escapeHTML(o.descripcion)}</p>
        </div>
      ` : ''}

      <!-- ARCHIVOS / IMÁGENES -->
      <div class="obra-files-box">
        <span class="od-label">/01 Fotos o Planos</span>
        <div class="files-preview-list">
          ${renderObraFiles(o.files)}
        </div>
      </div>

      <!-- SECCIÓN PRESUPUESTOS DE CONTRATISTAS -->
      <div class="obra-quotes-section">
        <div class="oqs-head">
          <h3>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Presupuestos Recibidos
          </h3>
          <span class="quotes-count-badge ${quotesBadgeClass}">${o.quotes.length} presupuesto${o.quotes.length === 1 ? '' : 's'}</span>
        </div>
        ${quotesContentHTML}
      </div>

    </article>
  `;
}

/* ── HTML de cada Presupuesto de Contratista ─────────── */
function quoteItemHTML(q, hasAccepted){
  const proFirst = q.profiles?.first_name || '';
  const proLast = q.profiles?.last_name ? q.profiles.last_name[0] + '.' : '';
  const proName = (proFirst + ' ' + proLast).trim() || 'Contratista Profesional';
  const proInitials = (proFirst?.[0] || 'C').toUpperCase();
  const proRubro = RUBRO_LABELS[q.professionals?.rubro] || q.professionals?.rubro || 'Especialista';

  const amountFmt = Number(q.amount || 0).toLocaleString('es-AR');
  const plazo = (q.features && q.features[0]) ? q.features[0] : null;

  const isAccepted = q.status === 'accepted';
  const isRejected = q.status === 'rejected';

  let cardClass = 'qitem-card';
  if (isAccepted) cardClass += ' is-accepted';
  if (isRejected) cardClass += ' is-rejected';

  let statusBadge = '';
  if (isAccepted) statusBadge = `<div class="qitem-status accepted">✓ Presupuesto Aceptado</div>`;
  else if (isRejected) statusBadge = `<div class="qitem-status rejected">✕ Rechazado</div>`;

  let actionBtns = '';
  if (!isAccepted && !isRejected && !hasAccepted){
    actionBtns = `
      <div class="qitem-actions">
        <button class="btn-accept-quote" data-accept-quote="${q.id}">Aceptar Presupuesto</button>
        <button class="btn-reject-quote" data-reject-quote="${q.id}">Rechazar</button>
      </div>
    `;
  } else if (!isAccepted && hasAccepted){
    actionBtns = `<div class="qitem-note">Otro presupuesto fue aceptado para esta obra.</div>`;
  }

  return `
    <div class="${cardClass}">
      ${statusBadge}
      <div class="qitem-head">
        <div class="qitem-pro-avatar">${escapeHTML(proInitials)}</div>
        <div class="qitem-pro-meta">
          <strong>${escapeHTML(proName)}</strong>
          <span>${escapeHTML(proRubro)}</span>
        </div>
        <div class="qitem-amount">$ ${escapeHTML(amountFmt)} <small>ARS</small></div>
      </div>
      
      <div class="qitem-body">
        ${plazo ? `<div class="qitem-plazo"><strong>Plazo estimado:</strong> ${escapeHTML(plazo)}</div>` : ''}
        ${q.description ? `<p class="qitem-desc">${escapeHTML(q.description)}</p>` : ''}
      </div>

      ${actionBtns}
    </div>
  `;
}

/* ── Acciones: Aceptar y Rechazar Presupuesto ────────── */
async function handleAcceptQuote(quoteId){
  if (!confirm('¿Estás seguro de que querés aceptar este presupuesto? El profesional será notificado.')) return;

  try {
    // Aceptación atómica en el backend: marca este presupuesto como aceptado,
    // rechaza el resto y pone la obra en curso, todo en una sola transacción.
    const { error } = await sb.rpc('accept_quote', { p_quote_id: quoteId });
    if (error) throw error;

    toast('ok', '¡Presupuesto Aceptado!', 'Notificamos al contratista para iniciar la obra.');
    
    // Recargar datos
    const session = getSession();
    if (session) await fetchClientObras(session.userId);

  } catch(err){
    console.error('Error aceptando presupuesto:', err);
    toast('err', 'Error', 'No se pudo aceptar el presupuesto. Intentá de nuevo.');
  }
}

async function handleRejectQuote(quoteId){
  try {
    const { error } = await sb
      .from('quotes')
      .update({ status: 'rejected' })
      .eq('id', quoteId);

    if (error) throw error;

    toast('info', 'Presupuesto Rechazado', 'El presupuesto fue descartado.');
    
    const session = getSession();
    if (session) await fetchClientObras(session.userId);

  } catch(err){
    console.error('Error rechazando presupuesto:', err);
    toast('err', 'Error', 'No se pudo rechazar el presupuesto.');
  }
}

/* ── Toast Notifications ─────────────────────────────── */
function toast(type, title, msg){
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'ok' ? 'ok' : type === 'err' ? 'err' : '');
  el.innerHTML = `
    <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor">${TICONS[type] || TICONS.info}</svg>
    <div>
      <div class="t">${escapeHTML(title)}</div>
      <div class="m">${escapeHTML(msg)}</div>
    </div>
  `;
  stack.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 4200);
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

/* ── Cursor Glow ─────────────────────────────────────── */
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
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return d.toLocaleDateString('es-AR');
}

function escapeHTML(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
