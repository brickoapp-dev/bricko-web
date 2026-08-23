/* client-perfil.js — Perfil del cliente: nombre, contacto, localidad y
   dirección. Sube la foto a Supabase Storage y guarda los datos en profiles. */

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
  document.getElementById('btnSave')?.addEventListener('click', save);

  await loadProfile(SESSION.userId);
});

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
      .select('first_name, last_name, phone, city, province, address, avatar_url')
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

    if (profile.avatar_url){
      const box = document.getElementById('avatarPreview');
      if (box) box.innerHTML = `<img src="${profile.avatar_url}" alt="avatar">`;
    }
  } catch(e){
    console.error('Error cargando perfil:', e);
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
  const btn = document.getElementById('btnSave');
  if (btn){ btn.disabled = true; btn.textContent = 'Guardando…'; }
  const uid = SESSION.userId;

  try {
    const update = {
      first_name: document.getElementById('fFirstName').value.trim() || null,
      last_name: document.getElementById('fLastName').value.trim() || null,
      phone: document.getElementById('fPhone').value.trim() || null,
      city: document.getElementById('fCity').value.trim() || null,
      province: document.getElementById('fProvince').value.trim() || null,
      address: document.getElementById('fAddress').value.trim() || null
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
