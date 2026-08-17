/* client-dashboard.js — Dashboard del cliente
   Panel de acceso a Mis Obras y Obra Nueva. */

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
  initCursorGlow();
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
