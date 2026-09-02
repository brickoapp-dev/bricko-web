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
  set('proAv', initials);
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

/* ── Cargar datos existentes ─────────────────────────── */
async function loadProfile(uid){
  try {
    const { data: profile } = await sb.from('profiles')
      .select('first_name, last_name, razon_social, terminos_version, terminos_aceptado_en, privacidad_version, privacidad_leida_en')
      .eq('id', uid).single();

    if (profile){
      const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
      set('fFirstName', profile.first_name);
      set('fLastName', profile.last_name);
      set('fRazonSocial', profile.razon_social);
      renderLegalInfo(profile);
    }

    const { data: pro } = await sb.from('professionals')
      .select('rubro, rubros, avatar_url, localidad, residencia')
      .eq('id', uid).single();

    if (pro){
      // rubros: usa el array nuevo; si está vacío, cae al rubro único viejo
      const rubros = (pro.rubros && pro.rubros.length) ? pro.rubros : (pro.rubro ? [pro.rubro] : []);
      document.querySelectorAll('#rubrosChips .chip').forEach(chip => {
        if (rubros.includes(chip.dataset.value)) chip.classList.add('selected');
      });
      if (pro.localidad)  document.getElementById('fLocalidad').value = pro.localidad;
      if (pro.residencia) document.getElementById('fResidencia').value = pro.residencia;
      if (pro.avatar_url){
        const box = document.getElementById('avatarPreview');
        if (box) box.innerHTML = `<img src="${pro.avatar_url}" alt="avatar">`;
      }
      const trade = document.getElementById('proTrade');
      if (trade) trade.textContent = RUBRO_LABELS[rubros[0]] || rubros[0] || 'Oficio';
    }

    const { data: verif } = await sb.from('professional_verification')
      .select(`dni_front_url, dni_back_url, direccion, dni_number, cuit, condicion_fiscal,
        usa_domicilio_alt, domicilio_contractual,
        matricula_entidad, matricula_numero, matricula_vencimiento, matricula_adjunto`)
      .eq('id', uid).maybeSingle();

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

    // 1) profiles: nombre / apellido / razón social ([6])
    const profileUpdate = {
      first_name: document.getElementById('fFirstName').value.trim() || null,
      last_name: document.getElementById('fLastName').value.trim() || null,
      razon_social: document.getElementById('fRazonSocial').value.trim() || null
    };
    const { error: e0 } = await sb.from('profiles').update(profileUpdate).eq('id', uid);
    if (e0) throw e0;

    // 2) professionals: directorio público
    const proUpdate = {
      rubros: getSelectedRubros(),
      localidad: document.getElementById('fLocalidad').value.trim() || null,
      residencia: document.getElementById('fResidencia').value.trim() || null
    };

    if (pending.avatar){
      const ext = (pending.avatar.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${uid}/avatar.${ext}`;
      await uploadFile('avatars', path, pending.avatar);
      const { data } = sb.storage.from('avatars').getPublicUrl(path);
      proUpdate.avatar_url = `${data.publicUrl}?v=${Date.now()}`;
    }

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

    if (pending.dniFront){
      const ext = (pending.dniFront.name.split('.').pop() || 'jpg').toLowerCase();
      verifUpsert.dni_front_url = await uploadFile('dni', `${uid}/dni-front.${ext}`, pending.dniFront);
    }
    if (pending.dniBack){
      const ext = (pending.dniBack.name.split('.').pop() || 'jpg').toLowerCase();
      verifUpsert.dni_back_url = await uploadFile('dni', `${uid}/dni-back.${ext}`, pending.dniBack);
    }
    if (pending.matricula){
      const ext = (pending.matricula.name.split('.').pop() || 'pdf').toLowerCase();
      verifUpsert.matricula_adjunto = await uploadFile('matricula', `${uid}/matricula.${ext}`, pending.matricula);
    }

    // 4) Persistir en la base
    const { error: e1 } = await sb.from('professionals').update(proUpdate).eq('id', uid);
    if (e1) throw e1;

    const { error: e2 } = await sb.from('professional_verification').upsert(verifUpsert, { onConflict: 'id' });
    if (e2) throw e2;

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
