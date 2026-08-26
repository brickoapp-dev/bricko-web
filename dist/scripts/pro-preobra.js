/* pro-preobra.js — Wizard de preparación de obra (6 gates) tras
   adjudicación: aceptación, comisión, contrato, plan de hitos,
   participantes y habilitación. */

const sb = window.supabase_client;

const MILESTONE_STATUS_LABEL = { pending:'Pendiente', in_progress:'En curso', review:'A revisar', done:'Finalizado' };
const MILESTONE_STATUS_CLASS = { pending:'', in_progress:'orange', review:'warn', done:'ok' };
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
let REQ_ID = null;
let UI_GATE = 1;
let GATE_FROM_URL = false;
const STATE = { request:null, prep:null, hitos:[], participantes:[], equipo:[] };

document.addEventListener('DOMContentLoaded', async () => {
  SESSION = getSession();
  if (!SESSION || !SESSION.userId){ window.location.replace('index.html'); return; }
  if (SESSION.role !== 'profesional'){ window.location.replace('client.html'); return; }

  const params = new URLSearchParams(window.location.search);
  REQ_ID = params.get('req');
  if (!REQ_ID){ window.location.replace('pro.html'); return; }
  const gateParam = Number(params.get('gate'));
  if (gateParam >= 1 && gateParam <= 6){ UI_GATE = gateParam; GATE_FROM_URL = true; }

  loadProUI(SESSION);
  initLogout();
  initThemeToggle();
  initEvents();

  await loadAll();
});

async function loadAll(){
  const { data: request, error: reqErr } = await sb
    .from('requests')
    .select('id, ticket_id, titulo, direccion, status')
    .eq('id', REQ_ID)
    .single();

  if (reqErr || !request){
    toast('err', 'No encontrada', 'Volviendo a la cartelera…');
    setTimeout(() => window.location.replace('pro.html'), 1800);
    return;
  }

  const { data: prep, error: prepErr } = await sb
    .from('obra_preparacion')
    .select('*')
    .eq('request_id', REQ_ID)
    .maybeSingle();

  if (prepErr || !prep){
    toast('err', 'Todavía no adjudicada', 'Esta obra no tiene una propuesta tuya aceptada.');
    setTimeout(() => window.location.replace('pro-ofertas.html'), 1800);
    return;
  }

  const { data: quote } = await sb
    .from('quotes')
    .select('amount')
    .eq('request_id', REQ_ID)
    .eq('pro_id', SESSION.userId)
    .eq('status', 'accepted')
    .maybeSingle();

  const { data: hitos } = await sb
    .from('hitos')
    .select('*')
    .eq('request_id', REQ_ID)
    .order('numero', { ascending: true });

  let participantes = [];
  if (hitos && hitos.length){
    const { data: parts } = await sb
      .from('hito_participantes')
      .select('*')
      .in('hito_id', hitos.map(h => h.id))
      .order('created_at', { ascending: true });
    participantes = parts || [];
  }

  const { data: equipo } = await sb
    .from('pro_equipo')
    .select('*')
    .order('nombre', { ascending: true });

  const { data: documentos } = await sb
    .from('obra_documentos')
    .select('id')
    .eq('request_id', REQ_ID);

  const firstLoad = STATE.prep == null;

  STATE.request = request;
  STATE.prep = prep;
  STATE.montoAdjudicado = quote?.amount || 0;
  STATE.hitos = hitos || [];
  STATE.participantes = participantes;
  STATE.equipo = equipo || [];
  STATE.documentosCount = documentos?.length || 0;

  if (firstLoad && !GATE_FROM_URL) UI_GATE = prep.current_gate || 2;
  render();
}

/* ── Render ──────────────────────────────────────────── */
function render(){
  const { request, prep } = STATE;
  if (!request || !prep) return;

  document.getElementById('obraKicker').textContent = (request.ticket_id || '') + ' · Adjudicada';
  document.getElementById('obraTitulo').textContent = request.titulo || 'Preparación de la obra.';
  document.getElementById('obraSub').textContent = 'Dirección: ' + (request.direccion || '—') + ' · Monto adjudicado: $ ' + money(STATE.montoAdjudicado);

  const overall = document.getElementById('setupOverallStatus');
  overall.textContent = prep.gate_habilitada ? 'Habilitada' : 'En preparación';
  overall.className = 'pj-status ' + (prep.gate_habilitada ? 'ok' : 'warn');

  const gateDone = { 1:true, 2:prep.gate_comision, 3:prep.gate_contrato, 4:prep.gate_hitos, 5:prep.gate_participantes, 6:prep.gate_habilitada };
  document.querySelectorAll('[data-setup-gate]').forEach(btn => {
    const n = Number(btn.dataset.setupGate);
    btn.classList.toggle('active', n === UI_GATE);
    btn.classList.toggle('done', !!gateDone[n]);
    btn.querySelector('.pj-gate-num').textContent = gateDone[n] ? '✓' : String(n).padStart(2, '0');
  });
  document.querySelectorAll('[data-gate-panel]').forEach(p => {
    p.classList.toggle('active', Number(p.dataset.gatePanel) === UI_GATE);
  });

  document.getElementById('montoAdjudicado').textContent = '$ ' + money(STATE.montoAdjudicado);
  document.getElementById('comisionMonto').textContent = '$ ' + money(prep.comision_monto) + ' (' + prep.comision_pct + '%)';
  setStatusPill('comisionStatus', prep.gate_comision, 'Acreditada', 'Pendiente');
  document.getElementById('btnToggleComision').textContent = prep.gate_comision ? 'Marcar pendiente' : 'Marcar acreditada';

  setStatusPill('docContratoStatus', prep.gate_contrato, 'Firmado', 'Pendiente');
  setStatusPill('docAnexoStatus', prep.gate_contrato, 'Firmado', 'Pendiente');
  setStatusPill('contratoStatus', prep.gate_contrato, 'Contrato firmado', 'Pendiente');
  document.getElementById('btnToggleContrato').textContent = prep.gate_contrato ? 'Marcar como borrador' : 'Marcar contrato firmado';

  renderMilestones();
  setStatusPill('hitosStatus', prep.gate_hitos, 'Plan confirmado', 'Pendiente');

  renderEquipoSelect();
  renderParticipants();
  const participantsStatus = document.getElementById('participantsStatus');
  participantsStatus.textContent = prep.gate_participantes ? 'Participantes validados' : 'Revisión pendiente';
  participantsStatus.className = 'pj-status ' + (prep.gate_participantes ? 'ok' : 'warn');

  setStatusPill('finalComision', prep.gate_comision, 'OK', 'Pendiente');
  setStatusPill('finalContrato', prep.gate_contrato, 'OK', 'Pendiente');
  setStatusPill('finalMilestones', prep.gate_hitos, 'OK', 'Pendiente');
  setStatusPill('finalParticipants', prep.gate_participantes, 'OK', 'Pendiente');

  const ready = prep.gate_comision && prep.gate_contrato && prep.gate_hitos && prep.gate_participantes;
  const enableBtn = document.getElementById('enableProject');
  const enableStatus = document.getElementById('enableStatus');
  enableBtn.disabled = !ready || prep.gate_habilitada;
  enableBtn.textContent = prep.gate_habilitada ? 'Obra habilitada' : 'Habilitar obra';
  enableStatus.textContent = prep.gate_habilitada ? 'Lista para iniciar' : (ready ? 'Lista para habilitar' : 'Faltan requisitos');
  enableStatus.className = 'pj-status ' + (prep.gate_habilitada ? 'ok' : (ready ? 'orange' : 'warn'));

  document.getElementById('shareLink').value = window.location.origin + '/client-solicitud.html?req=' + REQ_ID;

  const resumen = document.getElementById('carpetaResumen');
  if (resumen){
    const montoHitos = STATE.hitos.reduce((s, h) => s + Number(h.monto || 0), 0);
    resumen.textContent = `${STATE.hitos.length} hitos ($ ${money(montoHitos)}) · ${STATE.participantes.length} participantes asignados · ${STATE.documentosCount} documentos.`;
  }
}

function setStatusPill(id, done, okLabel, pendingLabel){
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = done ? okLabel : pendingLabel;
  el.className = 'pj-status ' + (done ? 'ok' : 'warn');
}

function renderMilestones(){
  const list = document.getElementById('milestonesList');
  if (!STATE.hitos.length){
    list.innerHTML = '<div class="pj-empty">Todavía no agregaste hitos.</div>';
  } else {
    list.innerHTML = STATE.hitos.map(h => `
      <article class="pj-milestone">
        <div class="pj-milestone-head">
          <div class="pj-milestone-num">${String(h.numero).padStart(2,'0')}</div>
          <div><div class="pj-small">Hito</div><h3>${escapeHTML(h.titulo)}</h3><div class="pj-small">${escapeHTML(h.descripcion || '')}</div></div>
          <span class="pj-status ${MILESTONE_STATUS_CLASS[h.status] || ''}">${MILESTONE_STATUS_LABEL[h.status] || h.status}</span>
        </div>
        <div class="pj-milestone-body">
          <div class="pj-milestone-meta">
            <div><small>Monto</small><strong>$ ${money(h.monto)}</strong></div>
            <div><small>Fecha</small><strong>${h.fecha_estimada ? new Date(h.fecha_estimada + 'T00:00:00').toLocaleDateString('es-AR') : '—'}</strong></div>
            <div><small>Avance</small><strong>${h.avance_pct}%</strong></div>
            <div><small>Pago</small><strong>${{pending:'Pendiente',approved:'Aprobado',paid:'Pagado'}[h.pago_estado] || h.pago_estado}</strong></div>
          </div>
          ${h.status === 'pending' ? `<div class="pj-actions" style="margin-top:12px"><button class="pj-btn" data-delete-hito="${h.id}">Eliminar</button></div>` : ''}
        </div>
      </article>
    `).join('');
  }

  const select = document.getElementById('pHito');
  select.innerHTML = STATE.hitos.map(h => `<option value="${h.id}">${String(h.numero).padStart(2,'0')} · ${escapeHTML(h.titulo)}</option>`).join('');
}

function renderEquipoSelect(){
  const select = document.getElementById('pEquipo');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">— Cargar manualmente —</option>' + STATE.equipo.map(p =>
    `<option value="${p.id}">${escapeHTML(p.nombre)}${p.especialidad ? ' · ' + escapeHTML(p.especialidad) : ''} — ${MODALIDAD_LABEL[p.modalidad] || p.modalidad}</option>`
  ).join('');
  select.value = STATE.equipo.some(p => p.id === current) ? current : '';

  const hint = document.getElementById('equipoEmptyHint');
  if (hint) hint.style.display = STATE.equipo.length ? 'none' : '';
}

function renderParticipants(){
  const tbody = document.querySelector('#participantsTable tbody');
  if (!STATE.participantes.length){
    tbody.innerHTML = '<tr><td colspan="5" class="pj-small" style="padding:16px 11px">Todavía no asignaste participantes.</td></tr>';
    return;
  }
  const hitoById = {};
  STATE.hitos.forEach(h => { hitoById[h.id] = h; });
  tbody.innerHTML = STATE.participantes.map(p => {
    const h = hitoById[p.hito_id];
    return `
      <tr>
        <td><strong>${h ? String(h.numero).padStart(2,'0') + ' · ' + escapeHTML(h.titulo) : '—'}</strong><small>${escapeHTML(p.especialidad || '')}</small></td>
        <td><strong>${escapeHTML(p.nombre)}</strong>${p.equipo_id ? '<small>Mi equipo</small>' : ''}</td>
        <td><span class="pj-role ${MODALIDAD_ROLE_CLASS[p.modalidad] || ''}">${MODALIDAD_LABEL[p.modalidad] || p.modalidad}</span></td>
        <td><small>${escapeHTML(p.documentacion_nota || '—')}</small></td>
        <td><button class="pj-btn" data-delete-participant="${p.id}">Quitar</button></td>
      </tr>
    `;
  }).join('');
}

/* ── Eventos ─────────────────────────────────────────── */
function initEvents(){
  document.addEventListener('click', async (e) => {
    const gateBtn = e.target.closest('[data-setup-gate]');
    if (gateBtn){ UI_GATE = Number(gateBtn.dataset.setupGate); render(); return; }

    const gotoBtn = e.target.closest('[data-goto-gate]');
    if (gotoBtn){ UI_GATE = Number(gotoBtn.dataset.gotoGate); render(); return; }

    if (e.target.closest('#btnToggleComision')){
      await sb.from('obra_preparacion').update({ gate_comision: !STATE.prep.gate_comision }).eq('request_id', REQ_ID);
      await loadAll();
      return;
    }

    if (e.target.closest('#btnToggleContrato')){
      await sb.from('obra_preparacion').update({ gate_contrato: !STATE.prep.gate_contrato }).eq('request_id', REQ_ID);
      await loadAll();
      return;
    }

    if (e.target.closest('#confirmMilestones')){
      const { error } = await sb.rpc('confirm_milestones_plan', { p_request_id: REQ_ID });
      if (error){ toast('err', 'No se pudo confirmar', error.message); return; }
      toast('ok', 'Plan por hitos confirmado', 'Ya podés pasar a participantes.');
      await loadAll();
      return;
    }

    if (e.target.closest('#confirmParticipants')){
      const { error } = await sb.rpc('confirm_participants', { p_request_id: REQ_ID });
      if (error){ toast('err', 'No se pudo confirmar', error.message); return; }
      toast('ok', 'Participantes validados', 'Ya podés pasar al control final.');
      await loadAll();
      return;
    }

    if (e.target.closest('#enableProject')){
      const { error } = await sb.rpc('enable_obra', { p_request_id: REQ_ID });
      if (error){ toast('err', 'No se pudo habilitar', error.message); return; }
      toast('ok', 'Obra habilitada', 'Ya podés empezar a trabajar los hitos.');
      await loadAll();
      return;
    }

    if (e.target.closest('#btnCopyLink')){
      const input = document.getElementById('shareLink');
      input.select();
      navigator.clipboard?.writeText(input.value).then(() => toast('ok', 'Copiado', 'Link de la obra copiado.')).catch(() => {});
      return;
    }

    const delHito = e.target.closest('[data-delete-hito]');
    if (delHito){
      const { error } = await sb.from('hitos').delete().eq('id', delHito.dataset.deleteHito);
      if (error){ toast('err', 'No se pudo eliminar', error.message); return; }
      await loadAll();
      return;
    }

    const delPart = e.target.closest('[data-delete-participant]');
    if (delPart){
      const { error } = await sb.from('hito_participantes').delete().eq('id', delPart.dataset.deleteParticipant);
      if (error){ toast('err', 'No se pudo quitar', error.message); return; }
      await loadAll();
      return;
    }
  });

  document.getElementById('newMilestoneForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const titulo = document.getElementById('mTitulo').value.trim();
    const descripcion = document.getElementById('mDescripcion').value.trim();
    const monto = Number(document.getElementById('mMonto').value);
    const fecha = document.getElementById('mFecha').value || null;
    if (!titulo || !monto){ toast('err', 'Faltan datos', 'Título y monto son obligatorios.'); return; }

    const numero = (STATE.hitos[STATE.hitos.length - 1]?.numero || 0) + 1;
    const { error } = await sb.from('hitos').insert({
      request_id: REQ_ID, numero, titulo, descripcion: descripcion || null, monto, fecha_estimada: fecha
    });
    if (error){ toast('err', 'No se pudo agregar', error.message); return; }
    e.target.reset();
    toast('ok', 'Hito agregado', titulo);
    await loadAll();
  });

  document.getElementById('pEquipo').addEventListener('change', (e) => {
    const equipoId = e.target.value;
    const member = STATE.equipo.find(p => p.id === equipoId);
    const nombreInput = document.getElementById('pNombre');
    const espInput = document.getElementById('pEspecialidad');
    const modInput = document.getElementById('pModalidad');
    const notaInput = document.getElementById('pNota');
    if (member){
      nombreInput.value = member.nombre;
      espInput.value = member.especialidad || '';
      modInput.value = member.modalidad;
      notaInput.value = member.documentacion_nota || '';
      nombreInput.readOnly = true; espInput.readOnly = true; modInput.disabled = true;
    } else {
      nombreInput.value = ''; espInput.value = ''; notaInput.value = '';
      nombreInput.readOnly = false; espInput.readOnly = false; modInput.disabled = false;
    }
  });

  document.getElementById('newParticipantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const equipo_id = document.getElementById('pEquipo').value || null;
    const hito_id = document.getElementById('pHito').value;
    const nombre = document.getElementById('pNombre').value.trim();
    const especialidad = document.getElementById('pEspecialidad').value.trim();
    const modalidad = document.getElementById('pModalidad').value;
    const documentacion_nota = document.getElementById('pNota').value.trim();
    if (!hito_id){ toast('err', 'Falta el hito', 'Agregá al menos un hito antes de asignar participantes.'); return; }
    if (!nombre){ toast('err', 'Falta el nombre', ''); return; }

    const { error } = await sb.from('hito_participantes').insert({
      hito_id, equipo_id, nombre, especialidad: especialidad || null, modalidad, documentacion_nota: documentacion_nota || null
    });
    if (error){ toast('err', 'No se pudo agregar', error.message); return; }
    e.target.reset();
    document.getElementById('pNombre').readOnly = false;
    document.getElementById('pEspecialidad').readOnly = false;
    document.getElementById('pModalidad').disabled = false;
    toast('ok', 'Participante agregado', nombre);
    await loadAll();
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

function money(n){ return Number(n || 0).toLocaleString('es-AR'); }

function escapeHTML(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
