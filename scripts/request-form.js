/* request-form.js — Lógica para solicitud-refaccion.html y solicitud-obra.html
   Adaptado a Supabase real: user_id, ticket_id, columnas reales y status en inglés. */

const sb = window.supabase_client;

/* ── Mapeos DB ↔ UI ──────────────────────────────────── */
const URG_VALUES   = new Set(['baja','media','alta']);
const ETAPA_VALUES = new Set(['ideas','planos','listo']);
const TIPO_CONSTRUCCION_VALUES = new Set(['vivienda','ampliacion','local','oficina','otro']);
const RUBRO_LABELS = {
  plomeria:'Plomería', gas:'Gas', electricidad:'Electricidad',
  albanileria:'Albañilería', pintura:'Pintura', carpinteria:'Carpintería',
  herreria:'Herrería', jardineria:'Jardinería'
};

/* ── Estado ──────────────────────────────────────────── */
let uploadedFiles = [];

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
  initForm();
  initLogout();
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

function addFiles(files){
  const MAX = 5;
  const allowed = Array.from(files).filter(f =>
    f.type.startsWith('image/') || f.type === 'application/pdf'
  );
  const remaining = MAX - uploadedFiles.length;
  allowed.slice(0, remaining).forEach(file => {
    if (file.type === 'application/pdf'){
      uploadedFiles.push({ file, url: null, isPdf: true });
      renderPreviews();
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        uploadedFiles.push({ file, url: ev.target.result, isPdf: false });
        renderPreviews();
      };
      reader.readAsDataURL(file);
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

/* ── Submit ──────────────────────────────────────────── */
function initForm(){
  const form = document.getElementById('requestForm');
  if (form) form.addEventListener('submit', handleSubmit);

  const successClose = document.getElementById('successClose');
  if (successClose) successClose.addEventListener('click', () => {
    window.location.href = 'client.html';
  });
}

async function handleSubmit(e){
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
  const addr = [direccion, ciudad, cp, provincia].filter(Boolean).join(', ') || 'Dirección no especificada';

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

  // Generar ticket
  const ticketId = 'BX-' + new Date().getFullYear() + '-' + Math.floor(Math.random() * 9000 + 1000);

  // Generar título a partir de rubros (refacción) o tipo_construccion (obra)
  const titulo = formType === 'refaccion'
    ? (rubros.length
        ? rubros.map(r => RUBRO_LABELS[r] || r).join(' + ') + ' — Solicitud'
        : 'Refacción')
    : (tipoConstruccion
        ? tipoConstruccion.charAt(0).toUpperCase() + tipoConstruccion.slice(1) + ' — Obra Nueva'
        : 'Obra Nueva');

  // Payload para Supabase
  const payload = {
    user_id: session.userId,
    ticket_id: ticketId,
    tipo: tipoDB,                            // 'refaccion' | 'obra-nueva'
    rubros: formType === 'refaccion' ? rubros : ['multi-gremio'],
    titulo,
    descripcion: desc,
    urgencia,                                // 'baja' | 'media' | 'alta'
    direccion: addr,
    etapa,
    tipo_construccion: tipoConstruccion,
    superficie: superficie ? parseInt(superficie) : null,
    status: 'pending'                        // enum en inglés
  };

  // Disabled button mientras guarda
  const submitBtn = document.querySelector('#requestForm .btn-submit, #requestForm button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const { error } = await sb.from('requests').insert(payload);
    if (error){
      console.error('Error al guardar en Supabase:', error);
      alert('No pudimos guardar la solicitud. Revisá la conexión e intentá de nuevo.\n\nDetalle: ' + error.message);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
  } catch(err){
    console.error('Excepción al guardar:', err);
    alert('No pudimos guardar la solicitud. Intentá de nuevo.');
    if (submitBtn) submitBtn.disabled = false;
    return;
  }

  // Éxito: mostrar overlay con el ticket
  const ticketEl = document.getElementById('successTicket');
  const overlay  = document.getElementById('successOverlay');
  if (ticketEl) ticketEl.textContent = 'TICKET #' + ticketId;
  if (overlay)  overlay.style.display = 'flex';

  // TODO: subir fotos a Supabase Storage cuando esté configurado el bucket
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
