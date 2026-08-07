/* pro-perfil.js — Perfil del profesional: foto, rubros, localidad, residencia,
   dirección y DNI (frente/dorso). Sube archivos a Supabase Storage y guarda
   los datos en professionals + professional_verification. */

const sb = window.supabase_client;

const RUBRO_LABELS = {
  plomeria: 'Plomería', gas: 'Gas', electricidad: 'Electricidad',
  albanileria: 'Albañilería', pintura: 'Pintura', carpinteria: 'Carpintería',
  herreria: 'Herrería', jardineria: 'Jardinería'
};

// Archivos pendientes de subir (si el usuario eligió uno nuevo)
const pending = { avatar: null, dniFront: null, dniBack: null };
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
  initLogout();
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
      .select('dni_front_url, dni_back_url, direccion')
      .eq('id', uid).maybeSingle();

    if (verif){
      if (verif.direccion) document.getElementById('fDireccion').value = verif.direccion;
      // DNI: bucket privado -> URL firmada temporal para previsualizar
      if (verif.dni_front_url) signedPreview(verif.dni_front_url, 'dropFront');
      if (verif.dni_back_url)  signedPreview(verif.dni_back_url, 'dropBack');
    }
  } catch(e){
    console.error('Error cargando perfil:', e);
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
  const btn = document.getElementById('btnSave');
  if (btn){ btn.disabled = true; btn.textContent = 'Guardando…'; }
  const uid = SESSION.userId;

  try {
    // 1) Subir archivos nuevos (si los hay)
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

    // 2) Datos privados (DNI + dirección)
    const verifUpsert = { id: uid, direccion: document.getElementById('fDireccion').value.trim() || null };

    if (pending.dniFront){
      const ext = (pending.dniFront.name.split('.').pop() || 'jpg').toLowerCase();
      verifUpsert.dni_front_url = await uploadFile('dni', `${uid}/dni-front.${ext}`, pending.dniFront);
    }
    if (pending.dniBack){
      const ext = (pending.dniBack.name.split('.').pop() || 'jpg').toLowerCase();
      verifUpsert.dni_back_url = await uploadFile('dni', `${uid}/dni-back.${ext}`, pending.dniBack);
    }

    // 3) Persistir en la base
    const { error: e1 } = await sb.from('professionals').update(proUpdate).eq('id', uid);
    if (e1) throw e1;

    const { error: e2 } = await sb.from('professional_verification').upsert(verifUpsert, { onConflict: 'id' });
    if (e2) throw e2;

    toast('ok', 'Perfil actualizado', 'Tus cambios se guardaron correctamente.');
    pending.avatar = pending.dniFront = pending.dniBack = null;
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
