/* pro-equipo.js — Directorio/roster propio del profesional
   (pro_equipo): CRUD simple. */

const sb = window.supabase_client;

const MODALIDAD_LABEL = {
  contratista:'Contratista', colaborador_independiente:'Colaborador independiente',
  dependiente:'Dependiente', subcontratista:'Subcontratista', profesional:'Profesional'
};
const MODALIDAD_ROLE_CLASS = {
  contratista:'contratista', colaborador_independiente:'padic',
  dependiente:'dep', subcontratista:'sub', profesional:'pro'
};

function getSession(){
  try {
    const s = localStorage.getItem('bricko-session') || sessionStorage.getItem('bricko-session');
    return s ? JSON.parse(s) : null;
  } catch(e){ return null; }
}

let SESSION = null;

document.addEventListener('DOMContentLoaded', async () => {
  SESSION = getSession();
  if (!SESSION || !SESSION.userId){ window.location.replace('index.html'); return; }
  if (SESSION.role !== 'profesional'){ window.location.replace('client.html'); return; }

  loadProUI(SESSION);
  initLogout();
  initThemeToggle();
  initModal();
  initEvents();

  await loadEquipo();
});

async function loadEquipo(){
  const { data, error } = await sb.from('pro_equipo').select('*').order('created_at', { ascending: false });
  if (error){ toast('err', 'Error de conexión', 'No pudimos cargar tu equipo.'); return; }

  const counts = { colaborador_independiente: 0, dependiente: 0, subcontratista: 0, profesional: 0 };
  (data || []).forEach(p => { if (counts[p.modalidad] != null) counts[p.modalidad]++; });
  document.getElementById('mPadic').textContent = counts.colaborador_independiente + ' / 3';
  document.getElementById('mDep').textContent = counts.dependiente;
  document.getElementById('mSub').textContent = counts.subcontratista;
  document.getElementById('mPro').textContent = counts.profesional;

  const tbody = document.getElementById('equipoTableBody');
  if (!data || !data.length){
    tbody.innerHTML = '<tr><td colspan="6" class="pj-small" style="padding:16px 11px">Todavía no agregaste participantes a tu equipo.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(p => `
    <tr>
      <td><strong>${escapeHTML(p.nombre)}</strong><small>${escapeHTML(p.cuit || '')}</small></td>
      <td>${escapeHTML(p.especialidad || '—')}</td>
      <td><span class="pj-role ${MODALIDAD_ROLE_CLASS[p.modalidad] || ''}">${MODALIDAD_LABEL[p.modalidad] || p.modalidad}</span></td>
      <td><small>${escapeHTML(p.documentacion_nota || '—')}</small></td>
      <td><span class="pj-status ${p.estado === 'vigente' ? 'ok' : 'warn'}">${p.estado === 'vigente' ? 'Vigente' : 'A revisar'}</span></td>
      <td><button class="pj-btn" data-delete-person="${p.id}">Quitar</button></td>
    </tr>
  `).join('');
}

function initModal(){
  document.getElementById('btnNewPerson').addEventListener('click', () => {
    document.getElementById('personForm').reset();
    document.getElementById('personModal').classList.add('open');
  });
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.modal-overlay').classList.remove('open'));
  });
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('open'); });
  });
}

function initEvents(){
  document.getElementById('personForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('eNombre').value.trim();
    const cuit = document.getElementById('eCuit').value.trim();
    const especialidad = document.getElementById('eEspecialidad').value.trim();
    const modalidad = document.getElementById('eModalidad').value;
    const documentacion_nota = document.getElementById('eNota').value.trim();
    if (!nombre){ toast('err', 'Falta el nombre', ''); return; }

    const { error } = await sb.from('pro_equipo').insert({
      pro_id: SESSION.userId, nombre, cuit: cuit || null, especialidad: especialidad || null,
      modalidad, documentacion_nota: documentacion_nota || null
    });
    if (error){ toast('err', 'No se pudo guardar', error.message); return; }

    document.getElementById('personModal').classList.remove('open');
    toast('ok', 'Participante agregado', nombre);
    await loadEquipo();
  });

  document.getElementById('equipoTableBody').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delete-person]');
    if (!del) return;
    const { error } = await sb.from('pro_equipo').delete().eq('id', del.dataset.deletePerson);
    if (error){ toast('err', 'No se pudo quitar', error.message); return; }
    await loadEquipo();
  });
}

/* ── Nav / UI compartida ─────────────────────────────── */
function loadProUI(session){
  const name = ((session.firstName || '') + ' ' + (session.lastName || '')).trim() || session.email?.split('@')[0] || 'Profesional';
  const initials = (session.firstName?.[0] || name[0] || 'P').toUpperCase();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('proAv', initials);
  set('proNm', session.firstName || name);
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

function escapeHTML(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
