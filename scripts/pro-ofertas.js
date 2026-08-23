/* pro-ofertas.js — "Mis ofertas": seguimiento de los presupuestos enviados
   por el profesional, con su estado (evaluación / negociación / adjudicada
   / no seleccionada) y la conversión. */

const sb = window.supabase_client;

const TIPO_LABEL = { refaccion: 'Refacción', 'obra-nueva': 'Obra Nueva' };
const RUBRO_LABELS = {
  plomeria: 'Plomería', gas: 'Gas', electricidad: 'Electricidad',
  albanileria: 'Albañilería', pintura: 'Pintura', carpinteria: 'Carpintería',
  herreria: 'Herrería', jardineria: 'Jardinería', 'multi-gremio': 'Multi-gremio'
};

// Mapeo de estado real (columna quotes.status) a lo que se muestra.
// 'negotiating' queda reservado: hoy nada en el producto lo dispara todavía,
// así que esa columna del resumen siempre va a leer 0 hasta que exista un
// flujo de contraoferta.
const STATUS_UI = {
  pending:     { label: 'En evaluación',   cls: 'eval' },
  negotiating: { label: 'En negociación',  cls: 'nego' },
  accepted:    { label: 'Adjudicada',      cls: 'won'  },
  rejected:    { label: 'No seleccionada', cls: 'lost' }
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
  initCursorGlow();

  await loadOfertas(session.userId);
});

/* ── Nav ─────────────────────────────────────────────── */
function loadProUI(session){
  const name = ((session.firstName || '') + ' ' + (session.lastName || '')).trim() || session.email?.split('@')[0] || 'Profesional';
  const initials = (session.firstName?.[0] || name[0] || 'P').toUpperCase();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('proAv', initials);
  set('proNm', session.firstName || name);
  const trade = session.rubros?.[0] || session.oficio;
  set('proTrade', RUBRO_LABELS[trade] || trade || 'Oficio');
}

function generateTitle(row){
  if (row.tipo === 'refaccion' && row.rubros?.length)
    return row.rubros.map(r => RUBRO_LABELS[r] || r).join(' + ') + ' — Solicitud';
  if (row.tipo === 'obra-nueva')
    return (row.tipo_construccion
      ? row.tipo_construccion.charAt(0).toUpperCase() + row.tipo_construccion.slice(1)
      : 'Obra Nueva') + ' — Obra Nueva';
  return TIPO_LABEL[row.tipo] || 'Solicitud';
}

/* ── Cargar mis ofertas ───────────────────────────────── */
async function loadOfertas(proId){
  try {
    const { data, error } = await sb.from('quotes')
      .select('id, request_id, amount, status, created_at, requests!quotes_request_id_fkey(titulo, tipo, rubros, ciudad, tipo_construccion)')
      .eq('pro_id', proId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    render(data || []);
  } catch(e){
    console.error('Error cargando mis ofertas:', e);
    toast('err', 'No se pudieron cargar tus ofertas', 'Probá de nuevo en un momento.');
    render([]);
  }
}

function render(quotes){
  updateStats(quotes);

  const body = document.getElementById('ofertasBody');
  const wrap = document.getElementById('ofertasTableWrap');
  const empty = document.getElementById('ofertasEmpty');
  if (!body) return;

  if (!quotes.length){
    wrap.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  wrap.style.display = '';
  empty.style.display = 'none';

  body.innerHTML = quotes.map(rowHTML).join('');
}

function rowHTML(q){
  const req = q.requests;
  const title = req ? (req.titulo || generateTitle(req)) : 'Solicitud no disponible';
  const zona = req?.ciudad || '—';
  const st = STATUS_UI[q.status] || { label: q.status || 'Pendiente', cls: 'eval' };
  const monto = Number(q.amount || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

  return `
    <tr>
      <td class="ot-title"><strong>${escapeHTML(title)}</strong><span>#${q.request_id.slice(0, 8)}</span></td>
      <td>${escapeHTML(zona)}</td>
      <td class="ot-amount">${monto}</td>
      <td><span class="ot-status ${st.cls}">${st.label}</span></td>
      <td>${timeAgo(q.created_at)}</td>
    </tr>`;
}

function updateStats(quotes){
  const count = (status) => quotes.filter(q => q.status === status).length;
  const evalN = count('pending');
  const negoN = count('negotiating');
  const wonN = count('accepted');
  const conv = quotes.length ? Math.round((wonN / quotes.length) * 100) : 0;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('kEval', evalN);
  set('kNego', negoN);
  set('kWon', wonN);
  set('kConv', conv + '%');
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

/* ── Helpers ─────────────────────────────────────────── */
function timeAgo(dateStr){
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Recién';
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `Hace ${days} d`;
  return d.toLocaleDateString('es-AR');
}
function escapeHTML(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
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
