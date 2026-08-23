/* client-dashboard.js — Dashboard del cliente
   Panel de acceso a Mis Obras y Obra Nueva. */

const sb = window.supabase_client;

function getSession(){
  try {
    const s = localStorage.getItem('bricko-session') || sessionStorage.getItem('bricko-session');
    return s ? JSON.parse(s) : null;
  } catch(e){ return null; }
}

function initDashboard() {
  const session = getSession();
  if (!session || !session.userId){ window.location.replace('index.html'); return; }
  if (session.role === 'profesional'){ window.location.replace('pro.html'); return; }

  loadUserUI(session);
  initActionCards();
  initLogout();
  initThemeToggle();
  initCursorGlow();
  loadClientMetrics(session.userId);
}

/* ── Métricas (Activas / Ofertas nuevas / Finalizadas) ── */
async function loadClientMetrics(uid){
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  try {
    const { data: reqs, error: e1 } = await sb.from('requests').select('id, status').eq('user_id', uid);
    if (e1) throw e1;
    const activas = (reqs || []).filter(r => r.status === 'active').length;
    const finalizadas = (reqs || []).filter(r => r.status === 'done').length;
    set('kpiActivas', activas);
    set('kpiFinalizadas', finalizadas);

    const { data: quotes, error: e2 } = await sb.from('quotes')
      .select('id, status, requests!quotes_request_id_fkey!inner(user_id)')
      .eq('requests.user_id', uid)
      .eq('status', 'pending');
    if (e2) throw e2;
    set('kpiOfertas', (quotes || []).length);
  } catch(e){
    console.warn('Error cargando métricas del cliente:', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}

/* ── UI: usuario en el nav ───────────────────────────── */
function loadUserUI(session){
  const name = ((session.firstName || '') + ' ' + (session.lastName || '')).trim() || session.email?.split('@')[0] || 'Usuario';
  const initials = (session.firstName?.[0] || name[0] || 'U').toUpperCase();
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('navUserName', session.firstName || name);
  set('userAv', initials);
  set('userNm', session.firstName || name);
}

/* ── Action cards ────────────────────────────────────── */
function initActionCards(){
  document.getElementById('cardMisObras')?.addEventListener('click', () => {
    window.location.href = 'mis-obras.html';
  });
  document.getElementById('cardObraNueva')?.addEventListener('click', () => {
    window.location.href = 'solicitud-obra.html';
  });
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

/* ── Cursor glow ─────────────────────────────────────── */
function initCursorGlow(){
  if (!window.matchMedia('(pointer:fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let raf = null;
  window.addEventListener('pointermove', (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      document.body.classList.add('spot-on');
      document.body.style.setProperty('--mx', e.clientX + 'px');
      document.body.style.setProperty('--my', e.clientY + 'px');
      raf = null;
    });
  });
  window.addEventListener('mouseleave', () => document.body.classList.remove('spot-on'));
}
