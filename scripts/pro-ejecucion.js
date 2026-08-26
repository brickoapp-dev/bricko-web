/* pro-ejecucion.js — Hitos de una obra habilitada: presentar avance,
   subir evidencia y cargar factura. */

const sb = window.supabase_client;

const MILESTONE_STATUS_LABEL = { pending:'Pendiente', in_progress:'En curso', review:'A revisar', done:'Finalizado' };
const MILESTONE_STATUS_CLASS = { pending:'', in_progress:'orange', review:'warn', done:'ok' };
const PAGO_LABEL = { pending:'Pendiente', approved:'Aprobado', paid:'Pagado' };

function getSession(){
  try {
    const s = localStorage.getItem('bricko-session') || sessionStorage.getItem('bricko-session');
    return s ? JSON.parse(s) : null;
  } catch(e){ return null; }
}

let SESSION = null;
let REQ_ID = null;
let HITOS = [];
let ACTIVE_HITO = null;

document.addEventListener('DOMContentLoaded', async () => {
  SESSION = getSession();
  if (!SESSION || !SESSION.userId){ window.location.replace('index.html'); return; }
  if (SESSION.role !== 'profesional'){ window.location.replace('client.html'); return; }

  REQ_ID = new URLSearchParams(window.location.search).get('req');
  if (!REQ_ID){ window.location.replace('pro.html'); return; }

  loadProUI(SESSION);
  initLogout();
  initThemeToggle();
  initModals();
  initEvents();

  await loadAll();
});

async function loadAll(){
  const { data: request } = await sb.from('requests').select('id, ticket_id, titulo, direccion').eq('id', REQ_ID).single();
  const { data: hitos, error } = await sb.from('hitos').select('*').eq('request_id', REQ_ID).order('numero', { ascending: true });

  if (error || !request){
    toast('err', 'No encontrada', 'Volviendo a la cartelera…');
    setTimeout(() => window.location.replace('pro.html'), 1800);
    return;
  }

  HITOS = hitos || [];

  document.getElementById('obraKicker').textContent = (request.ticket_id || '') + ' · En ejecución';
  document.getElementById('obraTitulo').textContent = request.titulo || 'Hitos y avance.';
  document.getElementById('obraSub').textContent = 'Dirección: ' + (request.direccion || '—');
  const carpetaLink = document.getElementById('btnVerCarpeta');
  if (carpetaLink) carpetaLink.href = 'client-solicitud.html?req=' + REQ_ID + '&tab=carpeta';

  const avgPct = HITOS.length ? Math.round(HITOS.reduce((s, h) => s + h.avance_pct, 0) / HITOS.length) : 0;
  const avg = document.getElementById('avanceGlobal');
  avg.textContent = avgPct + '% de avance';
  avg.className = 'pj-status ' + (avgPct >= 100 ? 'ok' : 'orange');

  render();
}

function render(){
  const list = document.getElementById('milestonesList');
  if (!HITOS.length){
    list.innerHTML = '<div class="pj-empty">Esta obra todavía no tiene hitos definidos. Andá a "Preparar obra" para armarlos.</div>';
    return;
  }
  list.innerHTML = HITOS.map(h => `
    <article class="pj-milestone">
      <div class="pj-milestone-head">
        <div class="pj-milestone-num">${String(h.numero).padStart(2,'0')}</div>
        <div><h3>${escapeHTML(h.titulo)}</h3><div class="pj-small">${escapeHTML(h.descripcion || '')}</div></div>
        <span class="pj-status ${MILESTONE_STATUS_CLASS[h.status] || ''}">${MILESTONE_STATUS_LABEL[h.status] || h.status}</span>
      </div>
      <div class="pj-milestone-body">
        <div class="pj-milestone-meta">
          <div><small>Monto</small><strong>$ ${money(h.monto)}</strong></div>
          <div><small>Avance</small><strong>${h.avance_pct}%</strong></div>
          <div><small>Pago</small><strong>${PAGO_LABEL[h.pago_estado] || h.pago_estado}</strong></div>
          <div><small>Nota</small><strong>${escapeHTML(h.avance_nota || '—')}</strong></div>
        </div>
        <div class="pj-progress-track"><div class="pj-progress-fill" style="width:${h.avance_pct}%"></div></div>
        ${h.status !== 'done' ? `
          <div class="pj-actions" style="justify-content:flex-start;margin-top:15px">
            <button class="pj-btn primary" data-open-progress="${h.id}">Presentar avance</button>
            <button class="pj-btn" data-open-invoice="${h.id}">Cargar factura</button>
          </div>` : ''}
      </div>
    </article>
  `).join('');
}

/* ── Modales ─────────────────────────────────────────── */
function initModals(){
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.modal-overlay').classList.remove('open'));
  });
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('open'); });
  });
}

function initEvents(){
  document.addEventListener('click', (e) => {
    const openProgress = e.target.closest('[data-open-progress]');
    if (openProgress){
      ACTIVE_HITO = HITOS.find(h => h.id === openProgress.dataset.openProgress);
      document.getElementById('progressModalHito').textContent = ACTIVE_HITO ? (String(ACTIVE_HITO.numero).padStart(2,'0') + ' · ' + ACTIVE_HITO.titulo) : '';
      document.getElementById('progressPct').value = ACTIVE_HITO?.avance_pct || 0;
      document.getElementById('progressNota').value = '';
      document.getElementById('progressFile').value = '';
      document.getElementById('progressModal').classList.add('open');
      return;
    }

    const openInvoice = e.target.closest('[data-open-invoice]');
    if (openInvoice){
      ACTIVE_HITO = HITOS.find(h => h.id === openInvoice.dataset.openInvoice);
      document.getElementById('invoiceModalHito').textContent = ACTIVE_HITO ? (String(ACTIVE_HITO.numero).padStart(2,'0') + ' · ' + ACTIVE_HITO.titulo) : '';
      document.getElementById('invoiceFile').value = '';
      document.getElementById('invoiceModal').classList.add('open');
      return;
    }
  });

  document.getElementById('btnSubmitProgress').addEventListener('click', submitProgress);
  document.getElementById('btnUploadInvoice').addEventListener('click', uploadInvoice);
}

async function submitProgress(){
  if (!ACTIVE_HITO) return;
  const btn = document.getElementById('btnSubmitProgress');
  const pct = Number(document.getElementById('progressPct').value) || 0;
  const nota = document.getElementById('progressNota').value.trim();
  const file = document.getElementById('progressFile').files?.[0];

  btn.disabled = true;
  try {
    if (file){
      const path = `${REQ_ID}/${ACTIVE_HITO.id}/evidencia-${Date.now()}.${(file.name.split('.').pop() || 'jpg').toLowerCase()}`;
      const { error: upErr } = await sb.storage.from('obra-docs').upload(path, file, { contentType: file.type, cacheControl: '3600' });
      if (upErr) throw upErr;
      await sb.from('obra_documentos').insert({ request_id: REQ_ID, hito_id: ACTIVE_HITO.id, tipo: 'evidencia', nombre: file.name, storage_path: path, estado: 'vigente' });
    }

    const { error } = await sb.rpc('submit_milestone_progress', { p_hito_id: ACTIVE_HITO.id, p_avance_pct: pct, p_nota: nota || null });
    if (error) throw error;

    document.getElementById('progressModal').classList.remove('open');
    toast('ok', 'Avance presentado', 'El cliente ya puede revisarlo.');
    await loadAll();
  } catch(err){
    toast('err', 'No se pudo presentar el avance', err.message || 'Intentá de nuevo.');
  } finally {
    btn.disabled = false;
  }
}

async function uploadInvoice(){
  if (!ACTIVE_HITO) return;
  const btn = document.getElementById('btnUploadInvoice');
  const file = document.getElementById('invoiceFile').files?.[0];
  if (!file){ toast('err', 'Elegí un archivo', ''); return; }

  btn.disabled = true;
  try {
    const path = `${REQ_ID}/${ACTIVE_HITO.id}/factura-${Date.now()}.${(file.name.split('.').pop() || 'pdf').toLowerCase()}`;
    const { error: upErr } = await sb.storage.from('obra-docs').upload(path, file, { contentType: file.type, cacheControl: '3600' });
    if (upErr) throw upErr;

    const { error } = await sb.from('obra_documentos').insert({ request_id: REQ_ID, hito_id: ACTIVE_HITO.id, tipo: 'factura', nombre: file.name, storage_path: path, estado: 'vigente' });
    if (error) throw error;

    document.getElementById('invoiceModal').classList.remove('open');
    toast('ok', 'Factura cargada', file.name);
    await loadAll();
  } catch(err){
    toast('err', 'No se pudo subir la factura', err.message || 'Intentá de nuevo.');
  } finally {
    btn.disabled = false;
  }
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
