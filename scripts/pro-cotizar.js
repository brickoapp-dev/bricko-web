/* pro-cotizar.js — Página dedicada para enviar un presupuesto */

const sb = window.supabase_client;

const URG_LABEL = { baja:'Baja', media:'Media', alta:'Urgente' };
const RUBRO_LABELS = {
  plomeria:'Plomería', gas:'Gas', electricidad:'Electricidad',
  albanileria:'Albañilería', pintura:'Pintura', carpinteria:'Carpintería',
  herreria:'Herrería', jardineria:'Jardinería', 'multi-gremio':'Multi-gremio'
};
const TIPO_LABEL = { refaccion:'Refacción', 'obra-nueva':'Obra Nueva' };

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

  const reqId = new URLSearchParams(window.location.search).get('req');
  if (!reqId){ window.location.replace('pro.html'); return; }

  loadProUI(session);
  initLogout();
  initCursorGlow();

  const [req, existingQuote] = await Promise.all([
    loadRequest(reqId),
    loadMyQuote(session.userId, reqId)
  ]);

  if (!req){
    toast('err', 'No encontrada', 'Volviendo a la cartelera…');
    setTimeout(() => window.location.replace('pro.html'), 2200);
    return;
  }

  renderDetail(req);
  renderPhotos(req);
  loadQuoteCount(req.id);

  const panelId = document.getElementById('panelId');
  if (panelId) panelId.textContent = 'SOL / ' + (req.ticketId || req.id?.slice(0,8));

  if (existingQuote){
    showExistingQuote(existingQuote);
  } else {
    initForm(req, session);
  }
});

/* ── Cargar solicitud desde Supabase ─────────────── */
async function loadRequest(reqId){
  try {
    const { data, error } = await sb
      .from('requests')
      .select('id, ticket_id, user_id, tipo, rubros, titulo, descripcion, urgencia, direccion, status, etapa, tipo_construccion, superficie, created_at, fotos, profiles!requests_user_id_fkey(first_name, last_name, city)')
      .eq('id', reqId)
      .single();
    if (error || !data) return null;
    return normalize(data);
  } catch(e){ return null; }
}

// Las solicitudes viejas guardaban un JSON de archivos adjuntos y el modo
// de pago embebidos como marcadores de texto dentro de la descripción
// (p.ej. "...texto... [ArchivosJSON: [{...}]] [Modo de pago: Contado]").
// Acá los separamos para no mostrarlos como texto crudo.
function parseDescripcion(raw){
  let text = (raw || '').trim();
  let modoPago = null;
  let embeddedFiles = [];

  const modoPagoMatch = text.match(/\[Modo de pago:\s*([^\]]+)\]/);
  if (modoPagoMatch){
    modoPago = modoPagoMatch[1].trim();
    text = text.replace(modoPagoMatch[0], '').trim();
  }

  const idx = text.indexOf('[ArchivosJSON:');
  if (idx !== -1){
    let jsonPart = text.slice(idx + '[ArchivosJSON:'.length).trim();
    if (jsonPart.endsWith(']')) jsonPart = jsonPart.slice(0, -1);
    try {
      const parsed = JSON.parse(jsonPart);
      if (Array.isArray(parsed)) embeddedFiles = parsed;
    } catch(e){ /* JSON corrupto o formato viejo distinto, ignorar */ }
    text = text.slice(0, idx).trim();
  }

  return { text, modoPago, embeddedFiles };
}

function normalize(row){
  const fn = row.profiles?.first_name || '';
  const ln = row.profiles?.last_name?.[0] ? row.profiles.last_name[0] + '.' : '';
  const clientName = (fn + ' ' + ln).trim() || 'Cliente';
  const { text: descripcion, modoPago, embeddedFiles } = parseDescripcion(row.descripcion);
  return {
    id: row.id,
    ticketId: row.ticket_id || ('SOL-' + row.id?.slice(0,4)),
    tipo: row.tipo,
    rubros: row.rubros || [],
    titulo: row.titulo || generateTitle(row),
    descripcion,
    modoPago,
    embeddedFiles,
    urgencia: row.urgencia,
    direccion: row.direccion,
    superficie: row.superficie,
    etapa: row.etapa,
    tipoConstruccion: row.tipo_construccion,
    status: row.status,
    createdAt: row.created_at,
    fotosPaths: row.fotos || [],
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

/* ── Cargar quote existente ──────────────────────── */
async function loadMyQuote(proId, reqId){
  try {
    const { data } = await sb
      .from('quotes')
      .select('id, request_id, amount, description, features, status, created_at')
      .eq('pro_id', proId)
      .eq('request_id', reqId)
      .maybeSingle();
    return data || null;
  } catch(e){ return null; }
}

async function loadQuoteCount(reqId){
  try {
    const { count } = await sb.from('quotes')
      .select('*', { count:'exact', head:true })
      .eq('request_id', reqId);
    const el = document.getElementById('detailQuotes');
    if (el) el.textContent = (count || 0) + ' presupuesto' + (count === 1 ? '' : 's');
  } catch(e){}
}

/* ── Render: detalle de la solicitud (izquierda) ─── */
function renderDetail(r){
  const container = document.getElementById('solicitudDetail');
  if (!container) return;

  const urgClass = 'urg-' + (r.urgencia || 'media');
  const obraClass = r.tipo === 'obra-nueva' ? ' t-obra' : '';

  const extraSections = r.superficie ? `
    <hr class="sol-divider" />
    <div class="sol-section">
      <div class="sol-section-label">DATOS DE OBRA</div>
      <div class="detail-grid">
        ${r.superficie ? `<div class="detail-row"><span class="dk">Superficie</span><span class="dv">${escapeHTML(String(r.superficie))} m²</span></div>` : ''}
        ${r.tipoConstruccion ? `<div class="detail-row"><span class="dk">Tipo</span><span class="dv">${escapeHTML(r.tipoConstruccion)}</span></div>` : ''}
        ${r.etapa ? `<div class="detail-row"><span class="dk">Etapa</span><span class="dv">${escapeHTML(r.etapa)}</span></div>` : ''}
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="sol-head">
      <span class="eyebrow">SOLICITUD EN TU ZONA</span>
      <h1 class="sol-title">${escapeHTML(r.titulo)}</h1>
      <div class="sol-tags">
        <span class="rc-tag">${escapeHTML(RUBRO_LABELS[r.primaryRubro] || r.primaryRubro)}</span>
        <span class="rc-tag${obraClass}">${escapeHTML(TIPO_LABEL[r.tipo] || r.tipo)}</span>
        <span class="rc-urg ${urgClass}">${escapeHTML(URG_LABEL[r.urgencia] || r.urgencia)}</span>
      </div>
    </div>

    <hr class="sol-divider" />

    <div class="sol-section">
      <div class="sol-section-label">DESCRIPCIÓN</div>
      <p class="sol-desc">${escapeHTML(r.descripcion || '—')}</p>
    </div>

    ${(r.fotosPaths?.length || r.embeddedFiles?.length) ? `
    <hr class="sol-divider" />
    <div class="sol-section">
      <div class="sol-section-label">FOTOS / PLANOS</div>
      <div class="sol-photos" id="solPhotos">Cargando…</div>
    </div>` : ''}

    <hr class="sol-divider" />

    <div class="sol-section">
      <div class="sol-section-label">CLIENTE</div>
      <div class="detail-client" style="margin-bottom:0; padding-bottom:0; border-bottom:none">
        <div class="client-av">${escapeHTML((r.clientName?.[0] || 'C').toUpperCase())}</div>
        <div class="client-info">
          <div class="client-name">${escapeHTML(r.clientName)}</div>
          <div class="client-meta">${escapeHTML(r.clientCity || 'Argentina')} · Cliente Brickø</div>
        </div>
      </div>
    </div>

    <hr class="sol-divider" />

    <div class="sol-section">
      <div class="sol-section-label">DETALLES</div>
      <div class="detail-grid">
        <div class="detail-row">
          <span class="dk">Dirección</span>
          <span class="dv">${escapeHTML(r.direccion || '—')}</span>
        </div>
        <div class="detail-row">
          <span class="dk">Urgencia</span>
          <span class="dv">${escapeHTML(URG_LABEL[r.urgencia] || r.urgencia || '—')}</span>
        </div>
        <div class="detail-row">
          <span class="dk">Publicado</span>
          <span class="dv">${timeAgo(r.createdAt)}</span>
        </div>
        <div class="detail-row">
          <span class="dk">Presupuestos</span>
          <span class="dv" id="detailQuotes">cargando…</span>
        </div>
        ${r.modoPago ? `
        <div class="detail-row">
          <span class="dk">Modo de pago</span>
          <span class="dv">${escapeHTML(r.modoPago)}</span>
        </div>` : ''}
      </div>
    </div>
    ${extraSections}
  `;
}

/* ── Fotos/planos adjuntos (bucket privado -> signed URLs) ─────── */
async function renderPhotos(r){
  const box = document.getElementById('solPhotos');
  if (!box) return;
  if (!r.fotosPaths?.length && !r.embeddedFiles?.length) return;

  const resolved = await Promise.all((r.fotosPaths || []).map(async (path) => {
    try {
      const { data } = await sb.storage.from('solicitudes').createSignedUrl(path, 3600);
      if (!data?.signedUrl) return null;
      return { url: data.signedUrl, isPdf: /\.pdf$/i.test(path), name: path.split('/').pop() || 'Archivo' };
    } catch(e){ return null; }
  }));

  // Solicitudes viejas: archivos embebidos como data URI en la descripción,
  // no requieren firma (ya son la URL final).
  const embedded = (r.embeddedFiles || [])
    .filter(f => f && typeof f.url === 'string')
    .map(f => ({ url: f.url, isPdf: !!f.isPdf, name: f.name || 'Archivo' }));

  const files = [...resolved.filter(Boolean), ...embedded];
  if (!files.length){ box.textContent = 'No se pudieron cargar los archivos.'; return; }

  box.innerHTML = files.map(f => f.isPdf
    ? `<a href="${escapeHTML(f.url)}" target="_blank" class="file-thumb-pdf" title="${escapeHTML(f.name)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>${escapeHTML(f.name)}</span>
      </a>`
    : `<div class="file-thumb-item" data-img-src="${escapeHTML(f.url)}" title="Ver imagen ampliada">
        <img src="${escapeHTML(f.url)}" alt="${escapeHTML(f.name)}" />
        <div class="file-thumb-overlay">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>
        </div>
      </div>`
  ).join('');

  box.querySelectorAll('.file-thumb-item').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const src = thumb.dataset.imgSrc;
      if (src) openImageModal(src);
    });
  });
}

/* ── Lightbox: ver imagen ampliada sin salir de la pantalla ──────
   Soporta pinch-to-zoom y doble-tap en mobile, y doble click en desktop. */
let modalZoom = { scale: 1, tx: 0, ty: 0 };

function applyModalZoom(img){
  img.style.transform = `translate(${modalZoom.tx}px, ${modalZoom.ty}px) scale(${modalZoom.scale})`;
}

function resetModalZoom(img){
  modalZoom = { scale: 1, tx: 0, ty: 0 };
  img.style.transition = '';
  applyModalZoom(img);
}

function bindImageZoomHandlers(img){
  const MAX_SCALE = 4;
  const dist = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  const clampScale = (s) => Math.min(MAX_SCALE, Math.max(1, s));

  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let panStart = null;
  let lastTapTime = 0;
  let lastTapPos = null;

  function toggleZoom(){
    img.style.transition = 'transform .2s ease';
    modalZoom = modalZoom.scale > 1
      ? { scale: 1, tx: 0, ty: 0 }
      : { scale: 2.5, tx: 0, ty: 0 };
    applyModalZoom(img);
    setTimeout(() => { img.style.transition = ''; }, 220);
  }

  img.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2){
      pinchStartDist = dist(e.touches[0], e.touches[1]);
      pinchStartScale = modalZoom.scale;
      panStart = null;
      return;
    }
    if (e.touches.length === 1){
      if (modalZoom.scale > 1){
        panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: modalZoom.tx, ty: modalZoom.ty };
      }
      const now = Date.now();
      const t = e.touches[0];
      const isDoubleTap = lastTapPos && (now - lastTapTime) < 300 &&
        Math.hypot(t.clientX - lastTapPos.x, t.clientY - lastTapPos.y) < 30;
      if (isDoubleTap){
        toggleZoom();
        lastTapTime = 0; lastTapPos = null;
      } else {
        lastTapTime = now; lastTapPos = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: true });

  img.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStartDist){
      e.preventDefault();
      const newDist = dist(e.touches[0], e.touches[1]);
      modalZoom.scale = clampScale(pinchStartScale * (newDist / pinchStartDist));
      if (modalZoom.scale === 1){ modalZoom.tx = 0; modalZoom.ty = 0; }
      applyModalZoom(img);
    } else if (e.touches.length === 1 && panStart){
      e.preventDefault();
      modalZoom.tx = panStart.tx + (e.touches[0].clientX - panStart.x);
      modalZoom.ty = panStart.ty + (e.touches[0].clientY - panStart.y);
      applyModalZoom(img);
    }
  }, { passive: false });

  img.addEventListener('touchend', (e) => {
    if (e.touches.length === 0){ pinchStartDist = 0; panStart = null; }
  });

  img.addEventListener('dblclick', toggleZoom);
}

function closeImageModal(modal){
  modal.classList.remove('open');
  document.body.style.overflow = '';
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
    bindImageZoomHandlers(document.getElementById('imgModalSrc'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.id === 'btnImgModalClose') closeImageModal(modal);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeImageModal(modal);
    });
  }
  const img = document.getElementById('imgModalSrc');
  img.src = src;
  resetModalZoom(img);
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/* ── Render: ya cotizaste ────────────────────────── */
function showExistingQuote(q){
  const formBody = document.getElementById('cotizarForm');
  const existing = document.getElementById('quotedState');
  if (formBody) formBody.style.display = 'none';
  if (!existing) return;

  const fmt = Number(q.amount).toLocaleString('es-AR');
  const plazo = q.features?.[0] || null;

  existing.style.display = '';
  existing.innerHTML = `
    <div class="quoted-check">
      <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
    </div>
    <h3>Ya cotizaste</h3>
    <p>Tu presupuesto fue enviado para esta solicitud.</p>
    <span class="quoted-amount">$ ${fmt}</span>
    ${q.description ? `<p style="font-size:13.5px;color:var(--ink-2);text-align:left;line-height:1.65;margin-bottom:18px">${escapeHTML(q.description)}</p>` : ''}
    ${plazo ? `<span class="quoted-plazo">PLAZO: ${escapeHTML(plazo)}</span>` : ''}
    <a href="pro.html" class="btn-back-feed">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      Volver a la cartelera
    </a>
  `;
}

/* ── Form de cotización ──────────────────────────── */
function initForm(req, session){
  const btn = document.getElementById('btnSendQuote');
  if (!btn) return;
  btn.addEventListener('click', () => submitQuote(req, session));
}

async function submitQuote(req, session){
  const amount = parseFloat(document.getElementById('quoteMonto')?.value || '0');
  const description = document.getElementById('quoteDesc')?.value.trim() || '';
  const plazo = document.getElementById('quoteDias')?.value.trim() || '';

  if (!amount || amount <= 0){ toast('err', 'Monto inválido', 'Ingresá un monto mayor a cero.'); return; }
  if (!description){ toast('err', 'Falta descripción', 'Describí qué incluye el presupuesto.'); return; }

  const btn = document.getElementById('btnSendQuote');
  if (btn){ btn.disabled = true; btn.classList.add('loading'); }

  try {
    const payload = {
      request_id: req.id,
      pro_id: session.userId,
      amount,
      description,
      features: plazo ? [plazo] : [],
      status: 'pending'
    };
    const { data, error } = await sb.from('quotes').insert(payload).select().single();
    if (error){
      toast('err', 'Error al enviar', error.message || 'No pudimos enviar el presupuesto.');
      if (btn){ btn.disabled = false; btn.classList.remove('loading'); }
      return;
    }
    // La transición pending -> quoted la hace un trigger en la DB al insertar
    // la quote (el pro no es dueño de la request y RLS bloqueaba este update).
    const fmt = Number(amount).toLocaleString('es-AR');
    toast('ok', 'Presupuesto enviado', `$${fmt} enviado correctamente.`);
    setTimeout(() => showExistingQuote(data), 600);
  } catch(err){
    console.error('Error enviando quote:', err);
    toast('err', 'Error al enviar', 'No pudimos enviar el presupuesto.');
    if (btn){ btn.disabled = false; btn.classList.remove('loading'); }
  }
}

/* ── UI: usuario en el nav ───────────────────────── */
function loadProUI(session){
  const name = ((session.firstName || '') + ' ' + (session.lastName || '')).trim() || session.email?.split('@')[0] || 'Profesional';
  const initials = (session.firstName?.[0] || name[0] || 'P').toUpperCase();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('proAv', initials);
  set('proNm', session.firstName || name);
  if (sb){
    sb.from('professionals').select('rubro').eq('id', session.userId).single()
      .then(({ data: pro }) => { if (pro) set('proTrade', RUBRO_LABELS[pro.rubro] || pro.rubro || '—'); })
      .catch(() => {});
  }
}

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

/* ── Toast ───────────────────────────────────────── */
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

/* ── Cursor glow ─────────────────────────────────── */
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

/* ── Helpers ─────────────────────────────────────── */
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
