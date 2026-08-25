/* pro-pagos.js — Cobros del cliente (por hito) y obligaciones con
   terceros (participantes asignados), across todas las obras del pro. */

const sb = window.supabase_client;

const PAGO_LABEL = { pending:'Pendiente', approved:'Aprobado', paid:'Pagado' };
const PAGO_CLASS = { pending:'', approved:'warn', paid:'ok' };
const MODALIDAD_LABEL = {
  contratista:'Contratista', colaborador_independiente:'Colaborador independiente',
  dependiente:'Dependiente', subcontratista:'Subcontratista', profesional:'Profesional'
};

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

  loadProUI(session);
  initLogout();
  initThemeToggle();

  await loadAll();
});

async function loadAll(){
  const { data: hitos, error } = await sb
    .from('hitos')
    .select('id, titulo, monto, pago_estado, status, requests(ticket_id, titulo)')
    .order('created_at', { ascending: false });

  if (error){
    toast('err', 'Error de conexión', 'No pudimos cargar tus cobros.');
    return;
  }

  const cobrosList = document.getElementById('cobrosList');
  if (!hitos || !hitos.length){
    cobrosList.innerHTML = '<p class="pj-small">Todavía no tenés hitos con obras habilitadas.</p>';
  } else {
    cobrosList.innerHTML = hitos.map(h => `
      <div class="pj-doc-row">
        <div><strong>${escapeHTML(h.titulo)}</strong><small>${escapeHTML(h.requests?.ticket_id || '')} · ${escapeHTML(h.requests?.titulo || '')}</small></div>
        <div class="pj-actions"><span class="pj-amount">$ ${money(h.monto)}</span><span class="pj-status ${PAGO_CLASS[h.pago_estado] || ''}">${PAGO_LABEL[h.pago_estado] || h.pago_estado}</span></div>
      </div>
    `).join('');
  }

  const hitoIds = (hitos || []).map(h => h.id);
  const obligacionesList = document.getElementById('obligacionesList');
  if (!hitoIds.length){
    obligacionesList.innerHTML = '<p class="pj-small">Sin participantes asignados todavía.</p>';
    return;
  }

  const { data: participantes } = await sb
    .from('hito_participantes')
    .select('id, nombre, modalidad, monto_pactado, hitos(titulo)')
    .in('hito_id', hitoIds)
    .order('created_at', { ascending: false });

  if (!participantes || !participantes.length){
    obligacionesList.innerHTML = '<p class="pj-small">Sin participantes asignados todavía.</p>';
    return;
  }

  obligacionesList.innerHTML = participantes.map(p => `
    <div class="pj-doc-row">
      <div><strong>${escapeHTML(p.nombre)}</strong><small>${MODALIDAD_LABEL[p.modalidad] || p.modalidad} · ${escapeHTML(p.hitos?.titulo || '')}</small></div>
      <div class="pj-actions">${p.monto_pactado != null ? `<span class="pj-amount">$ ${money(p.monto_pactado)}</span>` : '<span class="pj-status">Sin monto</span>'}</div>
    </div>
  `).join('');
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

function money(n){ return Number(n || 0).toLocaleString('es-AR'); }

function escapeHTML(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
