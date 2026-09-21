/* properfil.js — Perfil del profesional (titular de la cuenta): nombre,
   razón social, foto, rubros, localidad, residencia, dirección, DNI/CUIT,
   condición fiscal y matrícula profesional (campos [6]-[11] de
   BRICKO_01_Contrato_Tipo_Referencias.pdf). Sube archivos a Supabase
   Storage y guarda en profiles + professionals + professional_verification.

   No tiene nada que ver con "Mi equipo" (pro-equipo.html / pro_equipo):
   esto es el titular de la cuenta, el equipo es gente que el titular
   contrata para una obra puntual. Sin componentes ni tablas compartidas
   entre las dos pantallas. */

const sb = window.supabase_client;

const RUBRO_LABELS = {
  plomeria: 'Plomería', gas: 'Gas', electricidad: 'Electricidad',
  albanileria: 'Albañilería', pintura: 'Pintura', carpinteria: 'Carpintería',
  herreria: 'Herrería', jardineria: 'Jardinería'
};

// Archivos pendientes de subir (si el usuario eligió uno nuevo)
const pending = { avatar: null, dniFront: null, dniBack: null, matricula: null };
let SESSION = null;

// Última lectura del código de barras del dorso del DNI (ver leerCodigoDniDorso).
// null = no se leyó nada todavía en esta sesión de edición (no se toca lo que
// ya hubiera guardado antes, salvo que se suba un dorso nuevo).
let lastBarcodeReading = null;

function getSession(){
  try {
    const s = localStorage.getItem('bricko-session') || sessionStorage.getItem('bricko-session');
    return s ? JSON.parse(s) : null;
  } catch(e){ return null; }
}

document.addEventListener('DOMContentLoaded', async () => {
  SESSION = getSession();
  if (!SESSION || !SESSION.userId){ window.location.replace('index.html'); return; }
  if (SESSION.role !== 'profesional'){ window.location.replace('client.html'); return; }

  loadUserUI(SESSION);
  initChips();
  initFilePickers();
  initConditionalFields();
  initLogout();
  initThemeToggle();
  document.getElementById('btnSave')?.addEventListener('click', save);

  await loadProfile(SESSION.userId);
});

/* ── Nav ─────────────────────────────────────────────── */
function loadUserUI(session){
  const name = ((session.firstName || '') + ' ' + (session.lastName || '')).trim() || session.email?.split('@')[0] || 'Profesional';
  const initials = (session.firstName?.[0] || name[0] || 'P').toUpperCase();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  Auth.renderAvatarChip('proAv', session.avatarUrl, initials);
  set('proNm', session.firstName || name);
  const email = document.getElementById('fEmail');
  if (email) email.value = session.email || '';
}

/* ── Domicilio alternativo / condición fiscal: mostrar/ocultar ──────── */
function initConditionalFields(){
  document.getElementById('fUsaDomicilioAlt')?.addEventListener('change', (e) => {
    document.getElementById('domicilioAltField').hidden = !e.target.checked;
  });
  document.getElementById('fCondicionFiscal')?.addEventListener('change', applyCondicionFiscalVisibility);
}

function applyCondicionFiscalVisibility(){
  const factura = ['responsable_inscripto', 'monotributo'].includes(document.getElementById('fCondicionFiscal').value);
  document.getElementById('cuitOptionalTag').hidden = factura;
}

/* ── Validación: DNI (7-8 dígitos) y CUIT (dígito verificador módulo 11) ── */
function validarDni(dni){
  return /^[0-9]{7,8}$/.test(dni);
}

function validarCuit(cuit){
  if (!/^[0-9]{11}$/.test(cuit)) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(cuit[i]) * mult[i];
  let verificador = 11 - (suma % 11);
  if (verificador === 11) verificador = 0;
  if (verificador === 10) return false;
  return verificador === Number(cuit[10]);
}

function setFieldInvalid(fieldId, invalid){
  document.getElementById(fieldId)?.classList.toggle('invalid', invalid);
}

/* Valida los campos [7] y [10] antes de guardar. Devuelve true si todo
   está OK; si no, marca los campos inválidos. */
function validateIdentityFields(){
  let ok = true;
  const dni = document.getElementById('fDni').value.replace(/\D/g, '');
  const cuit = document.getElementById('fCuit').value.replace(/\D/g, '');
  const condicionFiscal = document.getElementById('fCondicionFiscal').value;
  const factura = ['responsable_inscripto', 'monotributo'].includes(condicionFiscal);

  const dniInvalido = dni !== '' && !validarDni(dni);
  setFieldInvalid('dniField', dniInvalido);
  if (dniInvalido) ok = false;

  const cuitInvalido = factura ? !validarCuit(cuit) : (cuit !== '' && !validarCuit(cuit));
  setFieldInvalid('cuitField', cuitInvalido);
  if (cuitInvalido) ok = false;

  const condicionFiscalInvalida = !condicionFiscal;
  setFieldInvalid('condicionFiscalField', condicionFiscalInvalida);
  if (condicionFiscalInvalida) ok = false;

  return ok;
}

/* ── Chips de rubros (multi) ─────────────────────────── */
function initChips(){
  document.querySelectorAll('#rubrosChips .chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
  });
}
function getSelectedRubros(){
  return [...document.querySelectorAll('#rubrosChips .chip.selected')].map(c => c.dataset.value);
}

/* ── File pickers + preview local ────────────────────── */
function initFilePickers(){
  bindFile('avatarInput', 'avatar', (url) => {
    const box = document.getElementById('avatarPreview');
    if (box) box.innerHTML = `<img src="${url}" alt="avatar">`;
  });
  bindFile('dniFrontInput', 'dniFront', (url) => setDrop('dropFront', url));
  bindFile('dniBackInput', 'dniBack', (url) => setDrop('dropBack', url));
  document.getElementById('dniBackInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) leerCodigoDniDorso(file);
  });
  document.getElementById('fDni')?.addEventListener('input', renderBarcodeStatus);

  document.getElementById('dropFront')?.addEventListener('click', () => {
    document.getElementById('dniFrontInput')?.click();
  });
  document.getElementById('dropBack')?.addEventListener('click', () => {
    document.getElementById('dniBackInput')?.click();
  });

  document.getElementById('matriculaInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    pending.matricula = file;
    const nameEl = document.getElementById('matriculaFileName');
    if (nameEl) nameEl.textContent = file.name;
  });
}
function bindFile(inputId, key, onPreview){
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')){ toast('err', 'Archivo inválido', 'Subí una imagen.'); return; }
    pending[key] = file;
    onPreview(URL.createObjectURL(file));
  });
}
function setDrop(dropId, url){
  const drop = document.getElementById(dropId);
  if (!drop) return;
  drop.classList.add('filled');
  let img = drop.querySelector('img');
  if (!img){ img = document.createElement('img'); drop.appendChild(img); }
  img.src = url;
}

/* ── DNI dorso: lectura best-effort del código de barras PDF417 ──────
   El DNI tarjeta argentino trae los datos del titular en un PDF417 en el
   dorso. Si el navegador soporta BarcodeDetector (hoy Chrome/Edge; Safari
   y Firefox no), lo leemos para avisar si el número tipeado no coincide
   con el del documento fotografiado -- pesca errores de tipeo o la foto
   equivocada antes de que llegue al revisor humano. Nunca bloquea el
   guardado, no prueba que el documento sea auténtico, y si el navegador
   no soporta la lectura simplemente no mostramos nada (no es un error). */
async function leerCodigoDniDorso(file){
  lastBarcodeReading = null;
  const statusEl = document.getElementById('dniBarcodeStatus');
  if (!statusEl) return;
  statusEl.hidden = true;

  if (!('BarcodeDetector' in window)) return;

  try {
    const formatos = await BarcodeDetector.getSupportedFormats();
    if (!formatos.includes('pdf417')) return;

    const bitmap = await createImageBitmap(file);
    const detector = new BarcodeDetector({ formats: ['pdf417'] });
    const codigos = await detector.detect(bitmap);
    if (!codigos.length) return;

    // Formato no 100% estandarizado entre versiones del DNI: en vez de
    // asumir un orden de campos fijo, buscamos entre los tokens separados
    // por '@' (u otros separadores vistos en la práctica) el que tenga
    // pinta de DNI (7-8 dígitos) y guardamos el crudo para que el revisor
    // pueda mirarlo si esta heurística no encuentra nada útil.
    const raw = codigos[0].rawValue || '';
    const tokens = raw.split(/[@;|]/).map(t => t.trim()).filter(Boolean);
    const dniLeido = tokens.find(t => /^[0-9]{7,8}$/.test(t)) || null;

    lastBarcodeReading = { tokens, dniLeido };
  } catch(e){
    // Foto borrosa, código no visible, navegador sin soporte real pese al
    // feature-detect, etc. -- silencioso, es un plus, no un requisito.
  } finally {
    renderBarcodeStatus();
  }
}

function renderBarcodeStatus(){
  const statusEl = document.getElementById('dniBarcodeStatus');
  if (!statusEl) return;
  const dniLeido = lastBarcodeReading?.dniLeido;
  if (!dniLeido){ statusEl.hidden = true; return; }

  const dniTipeado = document.getElementById('fDni').value.replace(/\D/g, '');
  statusEl.hidden = false;
  if (!dniTipeado){
    statusEl.className = 'dni-barcode-status';
    statusEl.textContent = `Código de barras leído: DNI ${dniLeido}. Completá el campo DNI si coincide.`;
  } else if (dniLeido === dniTipeado){
    statusEl.className = 'dni-barcode-status ok';
    statusEl.textContent = '✓ El código de barras del dorso coincide con el DNI que cargaste.';
  } else {
    statusEl.className = 'dni-barcode-status warn';
    statusEl.textContent = `⚠ El código de barras dice ${dniLeido}, distinto al DNI que cargaste (${dniTipeado}). Revisá antes de guardar.`;
  }
}

/* ── Cargar datos existentes ─────────────────────────── */
async function loadProfile(uid){
  try {
    // Las tres tablas del perfil son independientes: encadenadas con await
    // el formulario tardaba 3 round-trips en terminar de completarse (y los
    // campos se iban llenando "de a tandas" a la vista del usuario).
    // avatar_url se lee de profiles (no de professionals): es donde vive
    // para todos los roles desde el fix de la miniatura de perfil.
    const [
      { data: profile },
      { data: pro },
      { data: verif }
    ] = await Promise.all([
      sb.from('profiles')
        .select('first_name, last_name, razon_social, avatar_url, terminos_version, terminos_aceptado_en, privacidad_version, privacidad_leida_en')
        .eq('id', uid).single(),
      sb.from('professionals')
        .select('rubro, rubros, localidad, residencia')
        .eq('id', uid).single(),
      sb.from('professional_verification')
        .select(`dni_front_url, dni_back_url, direccion, dni_number, cuit, condicion_fiscal,
          usa_domicilio_alt, domicilio_contractual,
          matricula_entidad, matricula_numero, matricula_vencimiento, matricula_adjunto`)
        .eq('id', uid).maybeSingle()
    ]);

    if (profile){
      const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
      set('fFirstName', profile.first_name);
      set('fLastName', profile.last_name);
      set('fRazonSocial', profile.razon_social);
      renderLegalInfo(profile);
      if (profile.avatar_url){
        const box = document.getElementById('avatarPreview');
        if (box) box.innerHTML = `<img src="${profile.avatar_url}" alt="avatar">`;
        Auth.renderAvatarChip('proAv', profile.avatar_url);
      }
    }

    if (pro){
      // rubros: usa el array nuevo; si está vacío, cae al rubro único viejo
      const rubros = (pro.rubros && pro.rubros.length) ? pro.rubros : (pro.rubro ? [pro.rubro] : []);
      document.querySelectorAll('#rubrosChips .chip').forEach(chip => {
        if (rubros.includes(chip.dataset.value)) chip.classList.add('selected');
      });
      if (pro.localidad)  document.getElementById('fLocalidad').value = pro.localidad;
      if (pro.residencia) document.getElementById('fResidencia').value = pro.residencia;
      const trade = document.getElementById('proTrade');
      if (trade) trade.textContent = RUBRO_LABELS[rubros[0]] || rubros[0] || 'Oficio';
    }

    if (verif){
      const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
      if (verif.direccion) document.getElementById('fDireccion').value = verif.direccion;
      set('fDni', verif.dni_number);
      set('fCuit', verif.cuit);
      set('fCondicionFiscal', verif.condicion_fiscal);
      set('fMatriculaEntidad', verif.matricula_entidad);
      set('fMatriculaNumero', verif.matricula_numero);
      set('fMatriculaVencimiento', verif.matricula_vencimiento);

      document.getElementById('fUsaDomicilioAlt').checked = !!verif.usa_domicilio_alt;
      document.getElementById('domicilioAltField').hidden = !verif.usa_domicilio_alt;
      if (verif.domicilio_contractual) document.getElementById('fDomicilioAlt').value = verif.domicilio_contractual;

      if (verif.matricula_adjunto){
        const nombreArchivo = verif.matricula_adjunto.split('/').pop();
        const nameEl = document.getElementById('matriculaFileName');
        if (nameEl) nameEl.textContent = `Archivo cargado: ${nombreArchivo}`;
      }

      applyCondicionFiscalVisibility();

      // DNI/dorso y frente: bucket privado -> URL firmada temporal para previsualizar
      if (verif.dni_front_url) signedPreview(verif.dni_front_url, 'dropFront');
      if (verif.dni_back_url)  signedPreview(verif.dni_back_url, 'dropBack');
    }
  } catch(e){
    console.error('Error cargando perfil:', e);
  }
}

/* ── Legales y privacidad: qué versión aceptó y cuándo ───────────────── */
function renderLegalInfo(profile){
  const fmt = (iso) => iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  const terminosEl = document.getElementById('legalTerminosInfo');
  if (terminosEl){
    terminosEl.textContent = profile.terminos_version
      ? `Versión ${profile.terminos_version} · aceptada el ${fmt(profile.terminos_aceptado_en)}`
      : 'Todavía no hay un registro de aceptación.';
  }

  const privacidadEl = document.getElementById('legalPrivacidadInfo');
  if (privacidadEl){
    privacidadEl.textContent = profile.privacidad_version
      ? `Versión ${profile.privacidad_version} · leída el ${fmt(profile.privacidad_leida_en)}`
      : 'Todavía no hay un registro de lectura.';
  }
}

async function signedPreview(path, dropId){
  try {
    const { data } = await sb.storage.from('dni').createSignedUrl(path, 3600);
    if (data?.signedUrl) setDrop(dropId, data.signedUrl);
  } catch(e){ /* silencioso */ }
}

/* ── Subir un archivo y devolver el path ─────────────── */
async function uploadFile(bucket, path, file){
  const { error } = await sb.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600'
  });
  if (error) throw error;
  return path;
}

/* ── Guardar ─────────────────────────────────────────── */
async function save(){
  if (!validateIdentityFields()){
    toast('err', 'Revisá los datos marcados', 'Hay campos obligatorios o con formato inválido.');
    return;
  }

  const btn = document.getElementById('btnSave');
  if (btn){ btn.disabled = true; btn.textContent = 'Guardando…'; }
  const uid = SESSION.userId;

  try {
    const usaDomicilioAlt = document.getElementById('fUsaDomicilioAlt').checked;

    // 1) profiles: nombre / apellido / razón social ([6]) / avatar
    // (avatar_url vive en profiles para todos los roles, no en professionals:
    // así lo lee la sesión y el resto de las páginas al mostrar la miniatura)
    const profileUpdate = {
      first_name: document.getElementById('fFirstName').value.trim() || null,
      last_name: document.getElementById('fLastName').value.trim() || null,
      razon_social: document.getElementById('fRazonSocial').value.trim() || null
    };

    // 2) professionals: directorio público
    const proUpdate = {
      rubros: getSelectedRubros(),
      localidad: document.getElementById('fLocalidad').value.trim() || null,
      residencia: document.getElementById('fResidencia').value.trim() || null
    };

    // 3) professional_verification: datos privados (DNI/CUIT, domicilio,
    // condición fiscal, matrícula) -- [7],[8],[10],[11]
    const verifUpsert = {
      id: uid,
      direccion: document.getElementById('fDireccion').value.trim() || null,
      usa_domicilio_alt: usaDomicilioAlt,
      domicilio_contractual: usaDomicilioAlt ? (document.getElementById('fDomicilioAlt').value.trim() || null) : null,
      dni_number: document.getElementById('fDni').value.replace(/\D/g, '') || null,
      cuit: document.getElementById('fCuit').value.replace(/\D/g, '') || null,
      condicion_fiscal: document.getElementById('fCondicionFiscal').value || null,
      matricula_entidad: document.getElementById('fMatriculaEntidad').value.trim() || null,
      matricula_numero: document.getElementById('fMatriculaNumero').value.trim() || null,
      matricula_vencimiento: document.getElementById('fMatriculaVencimiento').value || null
    };

    // Las subidas son lo más lento del guardado (hasta 4 archivos) y antes
    // iban una detrás de la otra, encadenadas además con los 3 writes: en
    // total hasta 7 idas y vueltas en serie con el botón en "Guardando…".
    // Los archivos no dependen entre sí, así que suben todos juntos.
    const uploads = [];
    if (pending.avatar){
      const ext = (pending.avatar.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${uid}/avatar.${ext}`;
      uploads.push(uploadFile('avatars', path, pending.avatar).then(() => {
        const { data } = sb.storage.from('avatars').getPublicUrl(path);
        profileUpdate.avatar_url = `${data.publicUrl}?v=${Date.now()}`;
      }));
    }
    if (pending.dniFront){
      const ext = (pending.dniFront.name.split('.').pop() || 'jpg').toLowerCase();
      uploads.push(uploadFile('dni', `${uid}/dni-front.${ext}`, pending.dniFront)
        .then(path => { verifUpsert.dni_front_url = path; }));
    }
    if (pending.dniBack){
      const ext = (pending.dniBack.name.split('.').pop() || 'jpg').toLowerCase();
      uploads.push(uploadFile('dni', `${uid}/dni-back.${ext}`, pending.dniBack)
        .then(path => { verifUpsert.dni_back_url = path; }));
      // Cruce contra el código de barras (ver leerCodigoDniDorso): solo se
      // pisa cuando se sube un dorso nuevo, para no borrar una lectura
      // previa guardada si esta vez el guardado es de otro campo.
      const dniTipeado = document.getElementById('fDni').value.replace(/\D/g, '');
      verifUpsert.barcode_raw = lastBarcodeReading ? { tokens: lastBarcodeReading.tokens } : null;
      verifUpsert.barcode_dni_match = (lastBarcodeReading?.dniLeido && dniTipeado)
        ? lastBarcodeReading.dniLeido === dniTipeado
        : null;
    }
    if (pending.matricula){
      const ext = (pending.matricula.name.split('.').pop() || 'pdf').toLowerCase();
      uploads.push(uploadFile('matricula', `${uid}/matricula.${ext}`, pending.matricula)
        .then(path => { verifUpsert.matricula_adjunto = path; }));
    }

    // Si alguna subida falla, uploadFile() rechaza y el catch de abajo avisa
    // sin haber escrito nada -- igual que antes, cuando el await de la
    // subida cortaba el guardado.
    if (uploads.length) await Promise.all(uploads);

    // 4) Persistir en la base. Las tres tablas son independientes; se
    // escriben juntas en vez de en cadena. Como antes, si alguna falla el
    // catch muestra el error (el guardado nunca fue atómico: con el await
    // encadenado también podía quedar profiles escrito y el resto no).
    const [{ error: e0 }, { error: e1 }, { error: e2 }] = await Promise.all([
      sb.from('profiles').update(profileUpdate).eq('id', uid),
      sb.from('professionals').update(proUpdate).eq('id', uid),
      sb.from('professional_verification').upsert(verifUpsert, { onConflict: 'id' })
    ]);
    if (e0) throw e0;
    if (e1) throw e1;
    if (e2) throw e2;

    if (profileUpdate.avatar_url){
      // Reflejar el avatar nuevo en la sesión local (mismo patrón que client-perfil.js),
      // para que el chip del nav en el resto del sitio lo muestre sin tener que reloguear.
      SESSION.avatarUrl = profileUpdate.avatar_url;
      const store = localStorage.getItem('bricko-session') ? localStorage : sessionStorage;
      store.setItem('bricko-session', JSON.stringify(SESSION));
      Auth.renderAvatarChip('proAv', profileUpdate.avatar_url);
    }

    toast('ok', 'Perfil actualizado', 'Tus cambios se guardaron correctamente.');
    pending.avatar = pending.dniFront = pending.dniBack = pending.matricula = null;
  } catch(err){
    console.error('Error guardando perfil:', err);
    toast('err', 'No se pudo guardar', err.message || 'Intentá de nuevo.');
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = 'Guardar cambios'; }
  }
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

/* ── Toast (mismo patrón que el resto del sitio) ─────── */
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
