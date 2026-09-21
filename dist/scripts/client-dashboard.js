/* client-dashboard.js — Dashboard del cliente
   Panel de acceso a Mis Obras y Nueva Solicitud. */

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

/* ── Métricas (En preparación / Activas / Ofertas nuevas / Finalizadas) ── */
async function loadClientMetrics(uid){
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  try {
    // Las dos consultas no dependen una de la otra: encadenarlas con await
    // duplicaba la espera de los KPIs en cada entrada al panel.
    const [{ data: reqs, error: e1 }, { data: quotes, error: e2 }] = await Promise.all([
      sb.from('requests').select('id, status').eq('user_id', uid),
      sb.from('quotes')
        .select('id, status, requests!quotes_request_id_fkey!inner(user_id)')
        .eq('requests.user_id', uid)
        .eq('status', 'pending')
    ]);
    if (e1) throw e1;
    const preparacion = (reqs || []).filter(r => r.status === 'preparing').length;
    const activas = (reqs || []).filter(r => r.status === 'active').length;
    const finalizadas = (reqs || []).filter(r => r.status === 'done').length;
    set('kpiPreparacion', preparacion);
    set('kpiActivas', activas);
    set('kpiFinalizadas', finalizadas);

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
  Auth.renderAvatarChip('userAv', session.avatarUrl, initials);
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
  // Antes --mx/--my se escribian sobre <body>: como son custom properties
  // sin registrar, cada movimiento del mouse invalidaba el estilo de TODO
  // el arbol y repintaba el gradiente a pantalla completa. Ahora se
  // escriben sobre el propio .bg-spot, que en CSS pasa a moverse con
  // transform (trabajo de compositor, sin recalculo de estilos ni repaint).
  const spot = document.querySelector('.bg-spot');
  if (!spot) return;
  let raf = null;
  let lastX = 0, lastY = 0;
  window.addEventListener('pointermove', (e) => {
    lastX = e.clientX; lastY = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      document.body.classList.add('spot-on');
      spot.style.setProperty('--mx', lastX + 'px');
      spot.style.setProperty('--my', lastY + 'px');
      raf = null;
    });
  }, { passive: true });
  window.addEventListener('mouseleave', () => document.body.classList.remove('spot-on'));
}
