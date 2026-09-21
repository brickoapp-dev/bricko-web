/* admin-verificaciones.js — Panel interno: revisar y aprobar/rechazar las
   verificaciones de DNI pendientes de los profesionales. Gateado por
   is_admin() (tabla admins), no por profiles.role -- no existe un rol
   "admin" en el proyecto, esta es la primera pieza de ese concepto. */

const sb = window.supabase_client;

function getSession(){
  try {
    const s = localStorage.getItem('bricko-session') || sessionStorage.getItem('bricko-session');
    return s ? JSON.parse(s) : null;
  } catch(e){ return null; }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session || !session.userId){ window.location.replace('index.html'); return; }

  initLogout();
  initThemeToggle();

  try {
    const { data: esAdmin, error } = await sb.rpc('is_admin');
    if (error || !esAdmin){ window.location.replace('index.html'); return; }
  } catch(e){ window.location.replace('index.html'); return; }

  await loadPending();
});

async function loadPending(){
  const list = document.getElementById('list');
  const empty = document.getElementById('emptyState');
  try {
    const { data, error } = await sb.rpc('admin_list_pending_verifications');
    if (error) throw error;

    list.innerHTML = '';
    if (!data || !data.length){ empty.hidden = false; return; }
    empty.hidden = true;

    for (const row of data) await renderCard(row);
  } catch(e){
    console.error('Error cargando verificaciones pendientes:', e);
    toast('err', 'No se pudo cargar', e.message || 'Intentá de nuevo.');
  }
}

async function renderCard(row){
  const list = document.getElementById('list');
  const nombre = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Profesional';
  const ubicacion = [row.city, row.province].filter(Boolean).join(', ') || 'Sin ciudad cargada';
  const rubros = (row.rubros || []).join(', ') || 'Sin rubro cargado';

  const card = document.createElement('div');
  card.className = 'verif-card';
  card.dataset.id = row.professional_id;
  card.innerHTML = `
    <div class="verif-head">
      <div>
        <div class="verif-name">${escapeHtml(nombre)}</div>
        <div class="verif-meta">DNI ${escapeHtml(row.dni_number || '—')} · ${escapeHtml(ubicacion)} · ${escapeHtml(rubros)}</div>
      </div>
    </div>
    <div class="verif-grid">
      <div class="verif-photo" data-photo="front"><div class="ph">Cargando frente…</div></div>
      <div class="verif-photo" data-photo="back"><div class="ph">Cargando dorso…</div></div>
    </div>
    ${barcodeStatusHtml(row)}
    <div class="verif-actions">
      <button class="btn-approve" data-action="approve">Aprobar</button>
      <button class="btn-reject" data-action="reject-toggle">Rechazar</button>
      <div class="reject-box" data-role="reject-box">
        <textarea placeholder="Motivo del rechazo (obligatorio, lo puede ver el profesional)"></textarea>
        <div class="reject-confirm-row">
          <button class="btn-reject" data-action="reject-confirm">Confirmar rechazo</button>
        </div>
      </div>
    </div>
  `;
  list.appendChild(card);

  loadSignedPhoto(card, 'front', row.dni_front_url);
  loadSignedPhoto(card, 'back', row.dni_back_url);

  card.querySelector('[data-action="approve"]').addEventListener('click', () => review(card, row.professional_id, 'approved'));
  card.querySelector('[data-action="reject-toggle"]').addEventListener('click', () => {
    card.querySelector('[data-role="reject-box"]').classList.toggle('open');
  });
  card.querySelector('[data-action="reject-confirm"]').addEventListener('click', () => {
    const motivo = card.querySelector('.reject-box textarea').value.trim();
    if (!motivo){ toast('err', 'Falta el motivo', 'Escribí por qué se rechaza antes de confirmar.'); return; }
    review(card, row.professional_id, 'rejected', motivo);
  });
}

function barcodeStatusHtml(row){
  if (row.barcode_dni_match === true){
    return `<div class="dni-barcode-status ok">✓ El código de barras del dorso coincide con el DNI cargado.</div>`;
  }
  if (row.barcode_dni_match === false){
    return `<div class="dni-barcode-status warn">⚠ El código de barras leído no coincide con el DNI cargado. Revisá con atención.</div>`;
  }
  return `<div class="dni-barcode-status">No hay un cruce automático disponible para esta carga (navegador sin soporte o código no leído) -- revisá la foto igual.</div>`;
}

async function loadSignedPhoto(card, side, path){
  const box = card.querySelector(`[data-photo="${side}"]`);
  if (!box) return;
  if (!path){ box.querySelector('.ph').textContent = 'Sin foto cargada'; return; }
  try {
    const { data, error } = await sb.storage.from('dni').createSignedUrl(path, 600);
    if (error || !data?.signedUrl) throw error || new Error('sin url');
    box.innerHTML = `<img src="${data.signedUrl}" alt="DNI ${side === 'front' ? 'frente' : 'dorso'}">`;
  } catch(e){
    box.querySelector('.ph').textContent = 'No se pudo cargar la foto';
  }
}

async function review(card, professionalId, decision, rejectionReason){
  const buttons = card.querySelectorAll('button');
  buttons.forEach(b => b.disabled = true);
  try {
    const { error } = await sb.rpc('admin_review_verification', {
      p_professional_id: professionalId,
      p_decision: decision,
      p_rejection_reason: rejectionReason || null
    });
    if (error) throw error;
    toast('ok', decision === 'approved' ? 'Profesional verificado' : 'Verificación rechazada', '');
    card.remove();
    const list = document.getElementById('list');
    if (!list.children.length) document.getElementById('emptyState').hidden = false;
  } catch(e){
    console.error('Error revisando verificación:', e);
    toast('err', 'No se pudo guardar la revisión', e.message || 'Intentá de nuevo.');
    buttons.forEach(b => b.disabled = false);
  }
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
