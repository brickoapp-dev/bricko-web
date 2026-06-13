/* pro-cotizar.js — Página dedicada para enviar un presupuesto */

const sb = window.supabase_client;

const URG_LABEL = { baja:'Baja', media:'Media', alta:'Urgente' };
const RUBRO_LABELS = {
  plomeria:'Plomería', gas:'Gas', electricidad:'Electricidad',
  albanileria:'Albañilería', pintura:'Pintura', carpinteria:'Carpintería',
  herreria:'Herrería', jardineria:'Jardinería', 'multi-gremio':'Multi-gremio'
};
const TIPO_LABEL = { refaccion:'Refacción', 'obra-nueva':'Obra Nueva' };

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

  const reqId = new URLSearchParams(window.location.search).get('req');
  if (!reqId){ window.location.replace('pro.html'); return; }

  loadProUI(session);
  initLogout();
  initCursorGlow();

  const [req, existingQuote] = await Promise.all([
    loadRequest(reqId),
    loadMyQuote(session.userId, reqId)
  ]);

  if (!req){
    toast('err', 'No encontrada', 'Volviendo a la cartelera…');
    setTimeout(() => window.location.replace('pro.html'), 2200);
    return;
  }

  renderDetail(req);
  loadQuoteCount(req.id);

  const panelId = document.getElementById('panelId');
  if (panelId) panelId.textContent = 'SOL / ' + (req.ticketId || req.id?.slice(0,8));

  if (existingQuote){
    showExistingQuote(existingQuote);
  } else {
    initForm(req, session);
  }
});

/* ── Cargar solicitud desde Supabase ─────────────── */
async function loadRequest(reqId){
  try {
    const { data, error } = await sb
      .from('requests')
      .select('id, ticket_id, user_id, tipo, rubros, titulo, descripcion, urgencia, direccion, status, etapa, tipo_construccion, superficie, created_at, profiles!requests_user_id_fkey(first_name, last_name, city)')
      .eq('id', reqId)
      .single();
    if (error || !data) return null;
    return normalize(data);
  } catch(e){ return null; }
}

function normalize(row){
  const fn = row.profiles?.first_name || '';
  const ln = row.profiles?.last_name?.[0] ? row.profiles.last_name[0] + '.' : '';
  const clientName = (fn + ' ' + ln).trim() || 'Cliente';
  return {
    id: row.id,
    ticketId: row.ticket_id || ('SOL-' + row.id?.slice(0,4)),
    tipo: row.tipo,
    rubros: row.rubros || [],
    titulo: row.titulo || generateTitle(row),
    descripcion: row.descripcion,
    urgencia: row.urgencia,
    direccion: row.direccion,
    superficie: row.superficie,
    etapa: row.etapa,
    tipoConstruccion: row.tipo_construccion,
    status: row.status,
    createdAt: row.created_at,
    clientName,
    clientCity: row.profiles?.city || '',
    primaryRubro: row.rubros?.[0] || 'multi-gremio'
  };
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

/* ── Cargar quote existente ──────────────────────── */
async function loadMyQuote(proId, reqId){
  try {
    const { data } = await sb
      .from('quotes')
      .select('id, request_id, amount, description, features, status, created_at')
      .eq('pro_id', proId)
      .eq('request_id', reqId)
      .maybeSingle();
    return data || null;
  } catch(e){ return null; }
}

async function loadQuoteCount(reqId){
  try {
    const { count } = await sb.from('quotes')
      .select('*', { count:'exact', head:true })
      .eq('request_id', reqId);
    const el = document.getElementById('detailQuotes');
    if (el) el.textContent = (count || 0) + ' presupuesto' + (count === 1 ? '' : 's');
  } catch(e){}
}

/* ── Render: detalle de la solicitud (izquierda) ─── */
function renderDetail(r){
  const container = document.getElementById('solicitudDetail');
  if (!container) return;

  const urgClass = 'urg-' + (r.urgencia || 'media');
  const obraClass = r.tipo === 'obra-nueva' ? ' t-obra' : '';

  const extraSections = r.superficie ? `
    <hr class="sol-divider" />
    <div class="sol-section">
      <div class="sol-section-label">DATOS DE OBRA</div>
      <div class="detail-grid">
        ${r.superficie ? `<div class="detail-row"><span class="dk">Superficie</span><span class="dv">${escapeHTML(String(r.superficie))} m²</span></div>` : ''}
        ${r.tipoConstruccion ? `<div class="detail-row"><span class="dk">Tipo</span><span class="dv">${escapeHTML(r.tipoConstruccion)}</span></div>` : ''}
        ${r.etapa ? `<div class="detail-row"><span class="dk">Etapa</span><span class="dv">${escapeHTML(r.etapa)}</span></div>` : ''}
      </div>
    </div>` : '';

  container.innerHTML = `
    <div class="sol-head">
      <span class="eyebrow">SOLICITUD EN TU ZONA</span>
      <h1 class="sol-title">${escapeHTML(r.titulo)}</h1>
      <div class="sol-tags">
        <span class="rc-tag">${escapeHTML(RUBRO_LABELS[r.primaryRubro] || r.primaryRubro)}</span>
        <span class="rc-tag${obraClass}">${escapeHTML(TIPO_LABEL[r.tipo] || r.tipo)}</span>
        <span class="rc-urg ${urgClass}">${escapeHTML(URG_LABEL[r.urgencia] || r.urgencia)}</span>
      </div>
    </div>

    <hr class="sol-divider" />

    <div class="sol-section">
      <div class="sol-section-label">DESCRIPCIÓN</div>
      <p class="sol-desc">${escapeHTML(r.descripcion || '—')}</p>
    </div>

    <hr class="sol-divider" />

    <div class="sol-section">
      <div class="sol-section-label">CLIENTE</div>
      <div class="detail-client" style="margin-bottom:0; padding-bottom:0; border-bottom:none">
        <div class="client-av">${escapeHTML((r.clientName?.[0] || 'C').toUpperCase())}</div>
        <div class="client-info">
          <div class="client-name">${escapeHTML(r.clientName)}</div>
          <div class="client-meta">${escapeHTML(r.clientCity || 'Argentina')} · Cliente Brickø</div>
        </div>
      </div>
    </div>

    <hr class="sol-divider" />

    <div class="sol-section">
      <div class="sol-section-label">DETALLES</div>
      <div class="detail-grid">
        <div class="detail-row">
          <span class="dk">Dirección</span>
          <span class="dv">${escapeHTML(r.direccion || '—')}</span>
        </div>
        <div class="detail-row">
          <span class="dk">Urgencia</span>
          <span class="dv">${escapeHTML(URG_LABEL[r.urgencia] || r.urgencia || '—')}</span>
        </div>
        <div class="detail-row">
          <span class="dk">Publicado</span>
          <span class="dv">${timeAgo(r.createdAt)}</span>
        </div>
        <div class="detail-row">
          <span class="dk">Presupuestos</span>
          <span class="dv" id="detailQuotes">cargando…</span>
        </div>
      </div>
    </div>
    ${extraSections}
  `;
}

/* ── Render: ya cotizaste ────────────────────────── */
function showExistingQuote(q){
  const formBody = document.getElementById('cotizarForm');
  const existing = document.getElementById('quotedState');
  if (formBody) formBody.style.display = 'none';
  if (!existing) return;

  const fmt = Number(q.amount).toLocaleString('es-AR');
  const plazo = q.features?.[0] || null;

  existing.style.display = '';
  existing.innerHTML = `
    <div class="quoted-check">
      <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
    </div>
    <h3>Ya cotizaste</h3>
    <p>Tu presupuesto fue enviado para esta solicitud.</p>
    <span class="quoted-amount">$ ${fmt}</span>
    ${q.description ? `<p style="font-size:13.5px;color:var(--ink-2);text-align:left;line-height:1.65;margin-bottom:18px">${escapeHTML(q.description)}</p>` : ''}
    ${plazo ? `<span class="quoted-plazo">PLAZO: ${escapeHTML(plazo)}</span>` : ''}
    <a href="pro.html" class="btn-back-feed">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      Volver a la cartelera
    </a>
  `;
}

/* ── Form de cotización ──────────────────────────── */
function initForm(req, session){
  const btn = document.getElementById('btnSendQuote');
  if (!btn) return;
  btn.addEventListener('click', () => submitQuote(req, session));
}

async function submitQuote(req, session){
  const amount = parseFloat(document.getElementById('quoteMonto')?.value || '0');
  const description = document.getElementById('quoteDesc')?.value.trim() || '';
  const plazo = document.getElementById('quoteDias')?.value.trim() || '';

  if (!amount || amount <= 0){ toast('err', 'Monto inválido', 'Ingresá un monto mayor a cero.'); return; }
  if (!description){ toast('err', 'Falta descripción', 'Describí qué incluye el presupuesto.'); return; }

  const btn = document.getElementById('btnSendQuote');
  if (btn){ btn.disabled = true; btn.classList.add('loading'); }

  try {
    const payload = {
      request_id: req.id,
      pro_id: session.userId,
      amount,
      description,
      features: plazo ? [plazo] : [],
      status: 'pending'
    };
    const { data, error } = await sb.from('quotes').insert(payload).select().single();
    if (error){
      toast('err', 'Error al enviar', error.message || 'No pudimos enviar el presupuesto.');
      if (btn){ btn.disabled = false; btn.classList.remove('loading'); }
      return;
    }
    if (req.status === 'pending'){
      await sb.from('requests').update({ status: 'quoted' }).eq('id', req.id);
    }
    const fmt = Number(amount).toLocaleString('es-AR');
    toast('ok', 'Presupuesto enviado', `$${fmt} enviado correctamente.`);
    setTimeout(() => showExistingQuote(data), 600);
  } catch(err){
    console.error('Error enviando quote:', err);
    toast('err', 'Error al enviar', 'No pudimos enviar el presupuesto.');
    if (btn){ btn.disabled = false; btn.classList.remove('loading'); }
  }
}

/* ── UI: usuario en el nav ───────────────────────── */
function loadProUI(session){
  const name = ((session.firstName || '') + ' ' + (session.lastName || '')).trim() || session.email?.split('@')[0] || 'Profesional';
  const initials = (session.firstName?.[0] || name[0] || 'P').toUpperCase();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('proAv', initials);
  set('proNm', session.firstName || name);
  if (sb){
    sb.from('professionals').select('rubro').eq('id', session.userId).single()
      .then(({ data: pro }) => { if (pro) set('proTrade', RUBRO_LABELS[pro.rubro] || pro.rubro || '—'); })
      .catch(() => {});
  }
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

/* ── Toast ───────────────────────────────────────── */
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

/* ── Cursor glow ─────────────────────────────────── */
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

/* ── Helpers ─────────────────────────────────────── */
function timeAgo(dateStr){
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff/60000);
  if (min < 1) return 'recién';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.floor(min/60);
  if (h < 24) return 'hace ' + h + ' h';
  const days = Math.floor(h/24);
  if (days === 1) return 'ayer';
  if (days < 7) return 'hace ' + days + ' días';
  return d.toLocaleDateString('es-AR');
}

function escapeHTML(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
