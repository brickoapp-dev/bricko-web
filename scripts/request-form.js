/* request-form.js — Lógica para solicitud-refaccion.html y solicitud-obra.html
   Adaptado a Supabase real: user_id, ticket_id, columnas reales y status en inglés. */

const sb = window.supabase_client;

/* ── Mapeos DB ↔ UI ──────────────────────────────────── */
const URG_VALUES   = new Set(['baja','media','alta']);
const ETAPA_VALUES = new Set(['ideas','planos','listo']);
const TIPO_CONSTRUCCION_VALUES = new Set(['vivienda','ampliacion','local','oficina','otro']);
const RUBRO_LABELS = {
  albanileria: 'Albañilería',
  plomeria: 'Plomería',
  electricidad: 'Electricidad',
  gas: 'Gas',
  terminaciones: 'Terminaciones',
  exteriores: 'Exteriores',
  'limpieza-transporte': 'Limpieza y transporte',
  'diseno-planificacion': 'Diseño y Planificación',
  pintura: 'Pintura', carpinteria: 'Carpintería', herreria: 'Herrería', jardineria: 'Jardinería'
};
const URG_LABELS = {
  baja: 'Sin apuro',
  media: 'Este mes',
  alta: 'Urgente'
};

/* ── Estado ──────────────────────────────────────────── */
let uploadedFiles = [];
let pendingPayload = null;

/* ── Page protection ─────────────────────────────────── */
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
  return session;
}

/* ── Init ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const session = requireAuth();
  if (!session) return;

  loadUserUI(session);
  initChips();
  initUrgency();
  initUpload();
  initAddressMap();
  initGeolocation();
  initForm();
  initLogout();
  initThemeToggle();
});

/* ── UI: usuario en el nav ───────────────────────────── */
function loadUserUI(session){
  const name = (session.firstName || '') + (session.lastName ? ' ' + session.lastName : '');
  const display = name.trim() || session.email?.split('@')[0] || 'Usuario';
  const initials = (session.firstName?.[0] || display[0] || 'U').toUpperCase();
  const avEl = document.getElementById('userAv');
  const nmEl = document.getElementById('userNm');
  if (avEl) avEl.textContent = initials;
  if (nmEl) nmEl.textContent = display;
}

/* ── Chips: rubro (multi), etapa/tipo_construccion (single) ─ */
function initChips(){
  // Multi-select para rubros
  document.querySelectorAll('[data-field="rubro"] .chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });
  // Single-select para etapa y tipo_construccion
  ['etapa','tipo_construccion'].forEach(field => {
    const grid = document.querySelector(`[data-field="${field}"]`);
    if (!grid) return;
    grid.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        grid.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
      });
    });
  });
}

/* ── Urgencia (single-select) ────────────────────────── */
function initUrgency(){
  document.querySelectorAll('[data-field="urgencia"] .urg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-field="urgencia"] .urg-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
}

/* ── Upload de imágenes/PDFs (preview local, sin subir aún) ─ */
function initUpload(){
  const zone = document.getElementById('uploadZone');
  const input = document.getElementById('imgInput');
  const addMore = document.getElementById('uploadAddMore');
  if (!zone || !input) return;

  zone.addEventListener('click', (e) => {
    if (!e.target.closest('.img-preview-item') && !e.target.closest('.img-remove')) input.click();
  });
  if (addMore) addMore.addEventListener('click', (e) => { e.stopPropagation(); input.click(); });

  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });

  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    addFiles(e.dataTransfer.files);
  });
}

function compressImage(file, maxWidth = 900, quality = 0.75) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function addFiles(files){
  const MAX = 5;
  const allowed = Array.from(files).filter(f =>
    f.type.startsWith('image/') || f.type === 'application/pdf'
  );
  const remaining = MAX - uploadedFiles.length;
  allowed.slice(0, remaining).forEach(async (file) => {
    if (file.type === 'application/pdf'){
      uploadedFiles.push({ file, url: null, isPdf: true });
      renderPreviews();
    } else {
      const compressedUrl = await compressImage(file);
      uploadedFiles.push({ file, url: compressedUrl, isPdf: false });
      renderPreviews();
    }
  });
}

function renderPreviews(){
  const previews = document.getElementById('imgPreviews');
  const zone = document.getElementById('uploadZone');
  const addMore = document.getElementById('uploadAddMore');
  if (!previews || !zone) return;

  previews.innerHTML = uploadedFiles.map((item, i) => {
    if (item.isPdf){
      return `
        <div class="img-preview-item" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:var(--bg-2);">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:.06em;text-align:center;padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">PDF</span>
          <button class="img-remove" type="button" data-index="${i}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>`;
    }
    return `
      <div class="img-preview-item">
        <img src="${item.url}" alt="Imagen ${i + 1}">
        <button class="img-remove" type="button" data-index="${i}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>`;
  }).join('');

  previews.querySelectorAll('.img-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      uploadedFiles.splice(parseInt(btn.dataset.index), 1);
      renderPreviews();
    });
  });

  const hasFiles = uploadedFiles.length > 0;
  zone.classList.toggle('has-files', hasFiles);
  if (addMore) addMore.style.display = hasFiles && uploadedFiles.length < 5 ? 'flex' : 'none';
}

/* ── Mapa de ubicación (Google Maps iframe) ──────────── */
function initAddressMap(){
  const watchIds = ['reqProvincia','reqCiudad','reqCP','reqDireccion'];
  let debounce;
  watchIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      clearTimeout(debounce);
      debounce = setTimeout(updateMap, 900);
    });
  });
}
function updateMap(){
  const provincia = document.getElementById('reqProvincia')?.value || '';
  const ciudad    = document.getElementById('reqCiudad')?.value    || '';
  const cp        = document.getElementById('reqCP')?.value        || '';
  const direccion = document.getElementById('reqDireccion')?.value || '';
  const mapEmpty  = document.getElementById('mapEmpty');
  const mapIframe = document.getElementById('mapIframe');
  if (!mapEmpty || !mapIframe) return;

  const hasSuficiente = ciudad || direccion;
  if (!hasSuficiente){
    mapEmpty.style.display = 'flex';
    mapIframe.style.display = 'none';
    mapIframe.src = '';
    return;
  }
  const parts = [direccion, ciudad, cp, provincia, 'Argentina'].filter(Boolean);
  const query = encodeURIComponent(parts.join(', '));
  mapIframe.src = `https://maps.google.com/maps?q=${query}&output=embed&hl=es&z=15`;
  mapIframe.style.display = 'block';
  mapEmpty.style.display = 'none';
}

/* ── Autocompletar dirección con la ubicación del dispositivo ─ */
const PROVINCIA_ALIASES = {
  'ciudad autónoma de buenos aires': 'CABA',
  'ciudad autonoma de buenos aires': 'CABA',
  'caba': 'CABA'
};

function initGeolocation(){
  const btn = document.getElementById('btnUseLocation');
  if (!btn) return;
  btn.addEventListener('click', handleUseLocation);
}

function setGeolocLoading(btn, loading){
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('is-loading', loading);
  const label = btn.querySelector('span');
  if (label) label.textContent = loading ? 'Ubicando...' : 'Usar mi ubicación';
}

function handleUseLocation(){
  const btn = document.getElementById('btnUseLocation');
  if (!('geolocation' in navigator)){
    alert('Tu navegador no permite acceder a la ubicación del dispositivo.');
    return;
  }
  setGeolocLoading(btn, true);
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        await applyGeolocatedAddress(pos.coords.latitude, pos.coords.longitude);
      } catch(err){
        console.error('Error al obtener la dirección desde la ubicación:', err);
        alert('No pudimos completar la dirección automáticamente. Completá los campos manualmente.');
      } finally {
        setGeolocLoading(btn, false);
      }
    },
    (err) => {
      setGeolocLoading(btn, false);
      const messages = {
        1: 'Denegaste el acceso a tu ubicación. Habilitalo en la configuración del navegador para usar esta función.',
        2: 'No pudimos determinar tu ubicación. Intentá de nuevo o completá la dirección manualmente.',
        3: 'La solicitud de ubicación tardó demasiado. Intentá de nuevo.'
      };
      alert(messages[err.code] || 'No pudimos acceder a tu ubicación.');
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

async function applyGeolocatedAddress(lat, lon){
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&accept-language=es&zoom=18`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('Nominatim respondió ' + res.status);
  const data = await res.json();
  const addr = data.address || {};

  const provinciaSelect = document.getElementById('reqProvincia');
  const ciudadInput = document.getElementById('reqCiudad');
  const direccionInput = document.getElementById('reqDireccion');
  const cpInput = document.getElementById('reqCP');

  const calle = addr.road || addr.pedestrian || addr.residential || '';
  const numero = addr.house_number || '';
  const direccion = [calle, numero].filter(Boolean).join(' ');
  if (direccionInput && direccion) direccionInput.value = direccion;

  const ciudad = addr.city || addr.town || addr.village || addr.suburb || addr.municipality || '';
  if (ciudadInput && ciudad) ciudadInput.value = ciudad;

  if (cpInput && addr.postcode) cpInput.value = addr.postcode;

  if (provinciaSelect && addr.state){
    const match = matchProvincia(addr.state);
    if (match) provinciaSelect.value = match;
  }

  updateMap();
}

function matchProvincia(stateName){
  const select = document.getElementById('reqProvincia');
  if (!select) return null;
  const normalized = stateName.trim().toLowerCase();
  if (PROVINCIA_ALIASES[normalized]) return PROVINCIA_ALIASES[normalized];
  const options = Array.from(select.options).map(o => o.value).filter(Boolean);
  const exact = options.find(o => o.toLowerCase() === normalized);
  if (exact) return exact;
  const partial = options.find(o => normalized.includes(o.toLowerCase()) || o.toLowerCase().includes(normalized));
  return partial || null;
}

/* ── Submit & Summary Modal ───────────────────────────── */
function initForm(){
  const form = document.getElementById('requestForm');
  if (form) form.addEventListener('submit', handleFormSubmit);

  const btnEdit = document.getElementById('btnEditSummary');
  const btnCloseSummary = document.getElementById('summaryCloseBtn');
  const summaryOverlay = document.getElementById('summaryOverlay');

  if (btnEdit) btnEdit.addEventListener('click', () => { if (summaryOverlay) summaryOverlay.style.display = 'none'; });
  if (btnCloseSummary) btnCloseSummary.addEventListener('click', () => { if (summaryOverlay) summaryOverlay.style.display = 'none'; });

  const btnConfirm = document.getElementById('btnConfirmPublish');
  if (btnConfirm) btnConfirm.addEventListener('click', handleConfirmPublish);

  const successClose = document.getElementById('successClose');
  if (successClose) successClose.addEventListener('click', () => {
    window.location.href = 'client.html';
  });
}

function handleFormSubmit(e){
  e.preventDefault();
  const session = requireAuth();
  if (!session) return;

  // formType del body: 'refaccion' o 'obra'
  const formType = document.body.dataset.formType;
  const tipoDB = formType === 'obra' ? 'obra-nueva' : 'refaccion';

  // Recolectar campos
  const desc = document.getElementById('reqDesc')?.value.trim() || '';
  const superficie = document.getElementById('reqSuperficie')?.value || null;

  const provincia = document.getElementById('reqProvincia')?.value || '';
  const ciudad    = document.getElementById('reqCiudad')?.value    || '';
  const cp        = document.getElementById('reqCP')?.value        || '';
  const direccion = document.getElementById('reqDireccion')?.value || '';
  const addrParts = [direccion, ciudad, cp, provincia].filter(Boolean);
  const addr = addrParts.join(', ') || 'Dirección no especificada';

  // Validación mínima: descripción
  if (!desc){
    const descInput = document.getElementById('reqDesc');
    if (descInput){
      descInput.classList.add('error');
      descInput.focus();
      descInput.addEventListener('input', () => descInput.classList.remove('error'), { once: true });
    }
    return;
  }

  // Selecciones
  const rubros = [...document.querySelectorAll('[data-field="rubro"] .chip.selected')].map(c => c.dataset.value);
  const etapaRaw = document.querySelector('[data-field="etapa"] .chip.selected')?.dataset.value || null;
  const tipoConstruccionRaw = document.querySelector('[data-field="tipo_construccion"] .chip.selected')?.dataset.value || null;
  const urgenciaRaw = document.querySelector('[data-field="urgencia"] .urg-btn.selected')?.dataset.value || 'media';

  const etapa = ETAPA_VALUES.has(etapaRaw) ? etapaRaw : null;
  const tipoConstruccion = TIPO_CONSTRUCCION_VALUES.has(tipoConstruccionRaw) ? tipoConstruccionRaw : null;
  const urgencia = URG_VALUES.has(urgenciaRaw) ? urgenciaRaw : 'media';

  // El ticket_id lo asigna un trigger server-side de forma única (no se genera
  // en el cliente para evitar colisiones contra el UNIQUE).

  // Título
  const rubrosReadable = rubros.map(r => RUBRO_LABELS[r] || r);
  const titulo = formType === 'refaccion'
    ? (rubrosReadable.length ? rubrosReadable.join(' + ') + ' — Solicitud' : 'Refacción')
    : (rubrosReadable.length ? rubrosReadable.join(' + ') + ' — Obra Nueva' : 'Obra Nueva');

  // Las fotos/planos van aparte, subidas a Storage (ver handleConfirmPublish).
  pendingPayload = {
    user_id: session.userId,
    tipo: tipoDB,                            // 'refaccion' | 'obra-nueva'
    rubros: rubros.length ? rubros : ['albanileria'],
    titulo,
    descripcion: desc,
    urgencia,                                // 'baja' | 'media' | 'alta'
    direccion: addr,
    etapa,
    tipo_construccion: tipoConstruccion,
    superficie: superficie ? parseInt(superficie) : null,
    status: 'pending',
    // metadata visual para la confirmación
    _meta: {
      rawDesc: desc,
      rubrosLabels: rubrosReadable.length ? rubrosReadable.join(', ') : 'Ninguno seleccionado (Albañilería por defecto)',
      urgenciaLabel: URG_LABELS[urgencia] || 'Sin especificar',
      superficieLabel: superficie ? `${superficie} m²` : 'No especificada',
      filesCount: uploadedFiles.length ? `${uploadedFiles.length} archivo(s) subido(s)` : 'Sin fotos/planos',
      ubicacionLabel: addr
    }
  };

  // Renderizar modal de resumen
  renderSummaryModal(pendingPayload._meta);

  // Mostrar modal de resumen
  const summaryOverlay = document.getElementById('summaryOverlay');
  if (summaryOverlay) summaryOverlay.style.display = 'flex';
}

function renderSummaryModal(meta){
  const container = document.getElementById('summaryContent');
  if (!container) return;

  container.innerHTML = `
    <div class="summary-item">
      <div class="summary-item-label">/03 Rubros Afectados</div>
      <div class="summary-item-val">${escapeHTML(meta.rubrosLabels)}</div>
    </div>
    <div class="summary-item">
      <div class="summary-item-label">/02 Descripción del Proyecto</div>
      <div class="summary-item-val">${escapeHTML(meta.rawDesc)}</div>
    </div>
    <div class="summary-grid-2">
      <div class="summary-item">
        <div class="summary-item-label">/01 Fotos o Planos</div>
        <div class="summary-item-val">${escapeHTML(meta.filesCount)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-item-label">/04 Superficie</div>
        <div class="summary-item-val">${escapeHTML(meta.superficieLabel)}</div>
      </div>
    </div>
    <div class="summary-item">
      <div class="summary-item-label">/05 Urgencia</div>
      <div class="summary-item-val">${escapeHTML(meta.urgenciaLabel)}</div>
    </div>
    <div class="summary-item">
      <div class="summary-item-label">/06 Ubicación</div>
      <div class="summary-item-val">${escapeHTML(meta.ubicacionLabel)}</div>
    </div>
  `;
}

async function handleConfirmPublish(){
  if (!pendingPayload) return;

  const btnConfirm = document.getElementById('btnConfirmPublish');
  if (btnConfirm) btnConfirm.disabled = true;

  const summaryOverlay = document.getElementById('summaryOverlay');

  // Separar metadatos visuales antes de la inserción en DB
  const { _meta, ...dbPayload } = pendingPayload;

  let savedTicketId = '';
  let requestId = '';
  try {
    const { data, error } = await sb.from('requests').insert(dbPayload).select('id, ticket_id').single();
    if (error){
      console.error('Error al guardar en Supabase:', error);
      alert('No pudimos publicar la solicitud. Revisá tu conexión e intentá de nuevo.\n\nDetalle: ' + error.message);
      if (btnConfirm) btnConfirm.disabled = false;
      return;
    }
    savedTicketId = data?.ticket_id || '';
    requestId = data?.id || '';
  } catch(err){
    console.error('Excepción al guardar:', err);
    alert('No pudimos guardar la solicitud. Intentá de nuevo.');
    if (btnConfirm) btnConfirm.disabled = false;
    return;
  }

  // Subir fotos/planos a Storage (best-effort: si una falla, la solicitud
  // ya quedó guardada, no bloqueamos la publicación por esto).
  if (requestId && uploadedFiles.length > 0){
    const paths = [];
    for (let i = 0; i < uploadedFiles.length; i++){
      const item = uploadedFiles[i];
      const file = item.file;
      if (!file) continue;
      const ext = (file.name ? file.name.split('.').pop() : (item.isPdf ? 'pdf' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '') || (item.isPdf ? 'pdf' : 'jpg');
      const path = `${requestId}/${i}_${Date.now()}.${ext}`;
      try {
        const { error: upErr } = await sb.storage.from('solicitudes').upload(path, file, {
          contentType: file.type,
          upsert: true
        });
        if (upErr) { console.warn('Error subiendo archivo de solicitud:', upErr.message); continue; }
        paths.push(path);
      } catch(e){
        console.warn('Error subiendo archivo de solicitud:', e.message);
      }
    }
    if (paths.length > 0){
      const { error: imgErr } = await sb.from('requests').update({ fotos: paths }).eq('id', requestId);
      if (imgErr) console.warn('Error guardando referencias de imágenes:', imgErr.message);
    }
  }

  // Ocultar modal de resumen
  if (summaryOverlay) summaryOverlay.style.display = 'none';

  // Mostrar modal de éxito con el Ticket ID
  const ticketEl = document.getElementById('successTicket');
  const overlay  = document.getElementById('successOverlay');
  if (ticketEl) ticketEl.textContent = 'TICKET #' + savedTicketId;
  if (overlay)  overlay.style.display = 'flex';
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

function escapeHTML(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
