/* client-perfil.js — Perfil del cliente: nombre, contacto, localidad,
   dirección e identificación para contratos (razón social, DNI/CUIT,
   domicilio contractual, carácter respecto del inmueble -- campos
   [1],[2],[3],[5] de BRICKO_01_Contrato_Tipo_Referencias.pdf). Sube la
   foto a Supabase Storage y guarda todo en profiles. */

const sb = window.supabase_client;

// Archivo de avatar pendiente de subir (si el usuario eligió uno nuevo)
let pendingAvatar = null;
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
  if (SESSION.role === 'profesional'){ window.location.replace('pro.html'); return; }

  loadUserUI(SESSION);
  initFilePicker();
  initLogout();
  initThemeToggle();
  initConditionalFields();
  document.getElementById('btnSave')?.addEventListener('click', save);

  await loadProfile(SESSION.userId);
});

/* ── DNI/CUIT/Razón social/Carácter: mostrar/ocultar según selección ── */
function initConditionalFields(){
  document.getElementById('fTipoPersona')?.addEventListener('change', applyTipoPersonaVisibility);
  document.getElementById('fUsaDomicilioAlt')?.addEventListener('change', (e) => {
    document.getElementById('domicilioAltField').hidden = !e.target.checked;
  });
  document.getElementById('fCaracterInmueble')?.addEventListener('change', applyCaracterVisibility);
}

function applyTipoPersonaVisibility(){
  const esJuridica = document.getElementById('fTipoPersona').value === 'juridica';
  document.getElementById('dniField').hidden = esJuridica;
  document.getElementById('cuitOptionalTag').hidden = esJuridica;
}

function applyCaracterVisibility(){
  const esPropietario = document.getElementById('fCaracterInmueble').value === 'propietario' || document.getElementById('fCaracterInmueble').value === '';
  document.getElementById('caracterAclaracionField').hidden = esPropietario;
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

/* Valida los campos [2] y [5] antes de guardar. Devuelve true si todo
   está OK; si no, marca los campos inválidos y muestra por qué. */
function validateIdentityFields(){
  let ok = true;
  const tipoPersona = document.getElementById('fTipoPersona').value;
  const dni = document.getElementById('fDni').value.replace(/\D/g, '');
  const cuit = document.getElementById('fCuit').value.replace(/\D/g, '');
  const caracter = document.getElementById('fCaracterInmueble').value;
  const aclaracion = document.getElementById('fCaracterAclaracion').value.trim();

  const dniRequerido = tipoPersona === 'humana';
  const dniInvalido = dniRequerido ? !validarDni(dni) : (dni !== '' && !validarDni(dni));
  setFieldInvalid('dniField', dniInvalido);
  if (dniInvalido) ok = false;

  const cuitRequerido = tipoPersona === 'juridica';
  const cuitInvalido = cuitRequerido ? !validarCuit(cuit) : (cuit !== '' && !validarCuit(cuit));
  setFieldInvalid('cuitField', cuitInvalido);
  if (cuitInvalido) ok = false;

  const caracterInvalido = !caracter;
  setFieldInvalid('caracterField', caracterInvalido);
  if (caracterInvalido) ok = false;

  const aclaracionRequerida = caracter && caracter !== 'propietario';
  const aclaracionInvalida = aclaracionRequerida && !aclaracion;
  setFieldInvalid('caracterAclaracionField', aclaracionInvalida);
  if (aclaracionInvalida) ok = false;

  return ok;
}

/* ── Nav ─────────────────────────────────────────────── */
function loadUserUI(session){
  const name = ((session.firstName || '') + ' ' + (session.lastName || '')).trim() || session.email?.split('@')[0] || 'Usuario';
  const initials = (session.firstName?.[0] || name[0] || 'U').toUpperCase();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('userAv', initials);
  set('userNm', session.firstName || name);
  const avBox = document.getElementById('avatarPreview');
  if (avBox) avBox.textContent = initials;
  const email = document.getElementById('fEmail');
  if (email) email.value = session.email || '';
}

/* ── Avatar: file picker + preview local ─────────────── */
function initFilePicker(){
  const input = document.getElementById('avatarInput');
  if (!input) return;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')){ toast('err', 'Archivo inválido', 'Subí una imagen.'); return; }
    pendingAvatar = file;
    const box = document.getElementById('avatarPreview');
    if (box) box.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="avatar">`;
  });
}

/* ── Cargar datos existentes ─────────────────────────── */
async function loadProfile(uid){
  try {
    const { data: profile, error } = await sb.from('profiles')
      .select(`first_name, last_name, phone, city, province, address, avatar_url,
        razon_social, tipo_persona, dni, cuit, usa_domicilio_alt, domicilio_contractual,
        caracter_inmueble, caracter_inmueble_detalle,
        terminos_version, terminos_aceptado_en, privacidad_version, privacidad_leida_en`)
      .eq('id', uid).single();
    if (error) throw error;
    if (!profile) return;

    const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    set('fFirstName', profile.first_name);
    set('fLastName', profile.last_name);
    set('fPhone', profile.phone);
    set('fCity', profile.city);
    set('fProvince', profile.province);
    set('fAddress', profile.address);
    set('fRazonSocial', profile.razon_social);
    set('fTipoPersona', profile.tipo_persona || 'humana');
    set('fDni', profile.dni);
    set('fCuit', profile.cuit);
    set('fCaracterInmueble', profile.caracter_inmueble);
    set('fCaracterAclaracion', profile.caracter_inmueble_detalle);

    document.getElementById('fUsaDomicilioAlt').checked = !!profile.usa_domicilio_alt;
    document.getElementById('domicilioAltField').hidden = !profile.usa_domicilio_alt;
    if (profile.domicilio_contractual) document.getElementById('fDomicilioAlt').value = profile.domicilio_contractual;

    applyTipoPersonaVisibility();
    applyCaracterVisibility();

    if (profile.avatar_url){
      const box = document.getElementById('avatarPreview');
      if (box) box.innerHTML = `<img src="${profile.avatar_url}" alt="avatar">`;
    }

    renderLegalInfo(profile);
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

/* ── Subir avatar y devolver el path ─────────────────── */
async function uploadAvatar(uid, file){
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${uid}/avatar.${ext}`;
  const { error } = await sb.storage.from('avatars').upload(path, file, {
    upsert: true, contentType: file.type, cacheControl: '3600'
  });
  if (error) throw error;
  const { data } = sb.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
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
    const tipoPersona = document.getElementById('fTipoPersona').value;
    const usaDomicilioAlt = document.getElementById('fUsaDomicilioAlt').checked;
    const caracter = document.getElementById('fCaracterInmueble').value;

    const update = {
      first_name: document.getElementById('fFirstName').value.trim() || null,
      last_name: document.getElementById('fLastName').value.trim() || null,
      phone: document.getElementById('fPhone').value.trim() || null,
      city: document.getElementById('fCity').value.trim() || null,
      province: document.getElementById('fProvince').value.trim() || null,
      address: document.getElementById('fAddress').value.trim() || null,
      razon_social: document.getElementById('fRazonSocial').value.trim() || null,
      tipo_persona: tipoPersona,
      dni: tipoPersona === 'juridica' ? null : (document.getElementById('fDni').value.replace(/\D/g, '') || null),
      cuit: document.getElementById('fCuit').value.replace(/\D/g, '') || null,
      usa_domicilio_alt: usaDomicilioAlt,
      domicilio_contractual: usaDomicilioAlt ? (document.getElementById('fDomicilioAlt').value.trim() || null) : null,
      caracter_inmueble: caracter || null,
      caracter_inmueble_detalle: caracter !== 'propietario' ? (document.getElementById('fCaracterAclaracion').value.trim() || null) : null
    };

    if (pendingAvatar){
      update.avatar_url = await uploadAvatar(uid, pendingAvatar);
    }

    const { error } = await sb.from('profiles').update(update).eq('id', uid);
    if (error) throw error;

    // Reflejar los cambios en la sesión local (nombre/apellido usados en el nav de todo el sitio)
    SESSION.firstName = update.first_name || SESSION.firstName;
    SESSION.lastName = update.last_name || SESSION.lastName;
    SESSION.phone = update.phone || SESSION.phone;
    SESSION.city = update.city || SESSION.city;
    SESSION.province = update.province || SESSION.province;
    SESSION.address = update.address || SESSION.address;
    if (update.avatar_url) SESSION.avatarUrl = update.avatar_url;
    const store = localStorage.getItem('bricko-session') ? localStorage : sessionStorage;
    store.setItem('bricko-session', JSON.stringify(SESSION));
    loadUserUI(SESSION);

    toast('ok', 'Perfil actualizado', 'Tus cambios se guardaron correctamente.');
    pendingAvatar = null;
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
