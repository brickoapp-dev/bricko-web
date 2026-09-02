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
const CONTRATO_ESTADO_LABEL = {
  null: 'Borrador', enviado: 'Enviado', aceptado_cliente: 'Aceptado por el cliente',
  aceptado_contratista: 'Aceptado por vos', firmado: 'Firmado', invalidado: 'Borrador'
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
const STATE = { request:null, prep:null, hitos:[], participantes:[], equipo:[], documentosCount:0, contrato:null, planHitos:null };

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

  await loadContratoState();
  await loadPlanHitosState();

  if (firstLoad && !GATE_FROM_URL) UI_GATE = prep.current_gate || 2;
  render();
}

/* ── Plan por hitos: versión activa (confirmado/invalidado) ─────────── */
async function loadPlanHitosState(){
  const { data: version } = await sb
    .from('plan_hitos_versiones')
    .select('*')
    .eq('request_id', REQ_ID)
    .neq('estado', 'invalidado')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  STATE.planHitos = { version };
}

/* ── Contrato: payload+hash en vivo, reconciliación y versión activa ── */
async function loadContratoState(){
  const { payload, hash } = await window.buildContractPayload(REQ_ID);
  const faltantes = await window.validateContractData(REQ_ID);

  await sb.rpc('contrato_invalidar_si_cambio', { p_request_id: REQ_ID, p_hash_actual: hash });

  const { data: version } = await sb
    .from('contrato_versiones')
    .select('*')
    .eq('request_id', REQ_ID)
    .neq('estado', 'invalidado')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  let aceptaciones = [];
  if (version){
    const { data: acept } = await sb
      .from('contrato_aceptaciones')
      .select('*')
      .eq('contrato_version_id', version.id);
    aceptaciones = acept || [];
  }

  STATE.contrato = { payload, hash, faltantes, version, aceptaciones };
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

  renderContrato();
  setStatusPill('contratoStatus', prep.gate_contrato, 'Contrato firmado', 'Pendiente');

  renderPlanHitos();
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

function renderContrato(){
  const c = STATE.contrato;
  if (!c) return;

  const estado = c.version ? c.version.estado : null;
  const pill = document.getElementById('contratoEstadoPill');
  pill.textContent = CONTRATO_ESTADO_LABEL[estado] ?? estado;
  pill.className = 'pj-status ' + (estado === 'firmado' ? 'ok' : estado ? 'orange' : 'warn');

  const info = document.getElementById('contratoVersionInfo');
  info.textContent = c.version
    ? `Versión ${c.version.version} · enviado ${new Date(c.version.enviado_at).toLocaleString('es-AR')}`
      + (c.version.firmado_at ? ` · firmado ${new Date(c.version.firmado_at).toLocaleString('es-AR')}` : '')
    : 'Sin generar todavía';

  // Un faltante de perfil_cliente no es navegable desde acá: es la
  // pantalla del cliente (client-perfil.html), y esta página es
  // pro-only -- ir ahí solo rebotaría al pro de vuelta a pro.html.
  const esCorregibleAqui = (f) => !!f.pantalla && f.origen !== 'perfil_cliente';

  const faltantesEl = document.getElementById('contratoFaltantes');
  faltantesEl.innerHTML = c.faltantes.length ? `
    <div class="pj-panel pj-panel-pad" style="margin-top:14px">
      <div class="pj-kicker">Faltan ${c.faltantes.length} dato(s) para generar el contrato</div>
      ${c.faltantes.map(f => `
        <div class="pj-doc-row">
          <div><strong>[${f.id}] ${escapeHTML(f.label || 'Campo por definir')}</strong><small>${escapeHTML(f.nota || (f.motivo === 'vacio' ? (f.origen === 'perfil_cliente' ? 'Todavía no lo cargó el cliente en su perfil.' : 'Todavía no se cargó.') : 'Sin pantalla de origen todavía.'))}</small></div>
          ${esCorregibleAqui(f) ? `<a class="pj-btn" href="${f.pantalla}" target="_blank" rel="noopener">Corregir</a>` : ''}
        </div>
      `).join('')}
    </div>` : '';

  const yaFirmeYo = c.aceptaciones.some(a => a.rol === 'contratista');

  document.getElementById('btnCorregirDatos').disabled = !c.faltantes.some(esCorregibleAqui);
  document.getElementById('btnEnviarContrato').disabled = c.faltantes.length > 0 || !!estado;
  document.getElementById('btnFirmarContrato').disabled = !estado || estado === 'firmado' || yaFirmeYo;
  document.getElementById('btnDescargarFinal').disabled = estado !== 'firmado';
}

function renderPlanHitos(){
  const confirmado = !!STATE.planHitos?.version;

  renderResponsableSelect();

  const list = document.getElementById('milestonesList');
  if (!STATE.hitos.length){
    list.innerHTML = '<div class="pj-empty">Todavía no agregaste hitos.</div>';
  } else {
    list.innerHTML = STATE.hitos.map(h => {
      const plazoDias = h.plazo_propio ? h.plazo_observacion_dias : STATE.prep.plazo_observacion_dias_default;
      return `
      <article class="pj-milestone">
        <div class="pj-milestone-head">
          <div class="pj-milestone-num">${String(h.numero).padStart(2,'0')}</div>
          <div><div class="pj-small">Hito</div><h3>${escapeHTML(h.titulo)}</h3><div class="pj-small">${escapeHTML(h.descripcion || '')}</div></div>
          <span class="pj-status ${MILESTONE_STATUS_CLASS[h.status] || ''}">${MILESTONE_STATUS_LABEL[h.status] || h.status}</span>
        </div>
        <div class="pj-milestone-body">
          <div class="pj-milestone-meta">
            <div><small>Monto</small><strong>$ ${money(h.monto)}</strong></div>
            <div><small>Fecha objetivo</small><strong>${h.fecha_estimada ? new Date(h.fecha_estimada + 'T00:00:00').toLocaleDateString('es-AR') : '—'}</strong></div>
            <div><small>Criterio de aceptación</small><strong>${escapeHTML(h.criterio_aceptacion || '—')}</strong></div>
            <div><small>Responsable</small><strong>${escapeHTML(h.responsable_nombre || '—')}</strong></div>
            <div><small>Plazo de observación</small><strong>${plazoDias ? plazoDias + ' días' + (h.plazo_propio ? ' (propio)' : '') : '—'}</strong></div>
            <div><small>Avance</small><strong>${h.avance_pct}%</strong></div>
            <div><small>Pago</small><strong>${{pending:'Pendiente',approved:'Aprobado',paid:'Pagado'}[h.pago_estado] || h.pago_estado}</strong></div>
          </div>
          ${h.status === 'pending' && !confirmado ? `<div class="pj-actions" style="margin-top:12px"><button class="pj-btn" data-delete-hito="${h.id}">Eliminar</button></div>` : ''}
        </div>
      </article>
    `;
    }).join('');
  }

  const select = document.getElementById('pHito');
  select.innerHTML = STATE.hitos.map(h => `<option value="${h.id}">${String(h.numero).padStart(2,'0')} · ${escapeHTML(h.titulo)}</option>`).join('');

  // Monto adjudicado vs. suma de hitos (delta en vivo)
  const montoHitos = STATE.hitos.reduce((s, h) => s + Number(h.monto || 0), 0);
  const delta = montoHitos - STATE.montoAdjudicado;
  const deltaEl = document.getElementById('montoDeltaInfo');
  deltaEl.textContent = delta === 0
    ? `$ ${money(montoHitos)} = monto adjudicado`
    : `$ ${money(montoHitos)} vs. $ ${money(STATE.montoAdjudicado)} (${delta > 0 ? '+' : ''}${money(delta)})`;
  deltaEl.className = 'pj-status ' + (delta === 0 ? 'ok' : 'warn');

  // Fechas objetivo en orden creciente (advertencia, no bloqueo)
  const fechas = STATE.hitos.map(h => h.fecha_estimada).filter(Boolean);
  const enOrden = fechas.every((f, i) => i === 0 || f >= fechas[i - 1]);
  document.getElementById('fechaOrdenWarning').style.display = (fechas.length > 1 && !enOrden) ? '' : 'none';

  // Plazo de observación por defecto (obra)
  const plazoDefaultInput = document.getElementById('mPlazoDefault');
  if (document.activeElement !== plazoDefaultInput) plazoDefaultInput.value = STATE.prep.plazo_observacion_dias_default || '';
  plazoDefaultInput.disabled = confirmado;

  // Bloquear el form de alta y mostrar Editar/Reabrir en vez de Confirmar
  document.getElementById('newMilestoneForm').style.display = confirmado ? 'none' : '';
  document.getElementById('confirmMilestones').style.display = confirmado ? 'none' : '';
  document.getElementById('btnReabrirPlan').style.display = confirmado ? '' : 'none';
}

function renderResponsableSelect(){
  const select = document.getElementById('mResponsable');
  if (!select) return;
  const current = select.value;
  const yo = ((SESSION.firstName || '') + ' ' + (SESSION.lastName || '')).trim() || 'Yo (el contratista)';
  select.innerHTML = `<option value="">Seleccioná un responsable</option>
    <option value="__yo__">${escapeHTML(yo)} (vos)</option>
    ${STATE.equipo.map(p => `<option value="${p.id}">${escapeHTML(p.nombre)}${p.especialidad ? ' · ' + escapeHTML(p.especialidad) : ''}</option>`).join('')}`;
  select.value = current;
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

    if (e.target.closest('#btnVerBorrador')){
      openContratoPreview(STATE.contrato.payload, 'Vista previa — borrador en vivo');
      return;
    }

    if (e.target.closest('#btnCorregirDatos')){
      const destino = STATE.contrato.faltantes.find(f => f.pantalla && f.origen !== 'perfil_cliente');
      if (destino) window.open(destino.pantalla, '_blank', 'noopener');
      return;
    }

    if (e.target.closest('#btnEnviarContrato')){
      const { payload, hash } = STATE.contrato;
      const { error } = await sb.rpc('contrato_enviar', { p_request_id: REQ_ID, p_payload: payload, p_hash: hash });
      if (error){ toast('err', 'No se pudo enviar', error.message); return; }
      toast('ok', 'Contrato enviado', 'Quedó congelada esta versión. Ahora falta que cliente y contratista lo firmen.');
      await loadAll();
      return;
    }

    if (e.target.closest('#btnFirmarContrato')){
      const versionId = STATE.contrato.version?.id;
      if (!versionId) return;
      const { data, error } = await sb.rpc('contrato_aceptar', { p_version_id: versionId });
      if (error){ toast('err', 'No se pudo firmar', error.message); return; }
      if (data?.estado === 'firmado'){
        const { error: confirmErr } = await sb.rpc('confirm_contrato', { p_request_id: REQ_ID });
        if (confirmErr) console.warn('confirm_contrato:', confirmErr.message);
        toast('ok', 'Contrato firmado', 'Las dos partes aceptaron esta versión. Ya podés pasar al plan de hitos.');
      } else {
        toast('ok', 'Firma registrada', 'Falta que la otra parte también firme para que quede firmado.');
      }
      await loadAll();
      return;
    }

    if (e.target.closest('#btnDescargarFinal')){
      const v = STATE.contrato.version;
      if (v?.estado === 'firmado') downloadContratoFinal(v);
      return;
    }

    if (e.target.closest('[data-close-contrato-modal]') || e.target.id === 'contratoPreviewModal'){
      document.getElementById('contratoPreviewModal').classList.remove('open');
      return;
    }

    if (e.target.closest('#confirmMilestones')){
      const { payload, hash } = await buildPlanHitosPayload();
      const { error } = await sb.rpc('plan_hitos_confirmar', { p_request_id: REQ_ID, p_payload: payload, p_hash: hash });
      if (error){ toast('err', 'No se pudo confirmar', error.message); return; }
      toast('ok', 'Plan por hitos confirmado', 'Los hitos quedaron de solo lectura. Ya podés pasar a participantes.');
      await loadAll();
      return;
    }

    if (e.target.closest('#btnReabrirPlan')){
      const contratoFirmado = STATE.contrato?.version?.estado === 'firmado';
      document.getElementById('reabrirPlanText').textContent = contratoFirmado
        ? 'El contrato ya está FIRMADO por las dos partes. Si reabrís el plan por hitos para editarlo, la próxima vez que se detecte el cambio el contrato firmado va a quedar invalidado y va a haber que enviarlo y firmarlo de nuevo. ¿Confirmás que querés reabrir igual?'
        : 'Vas a poder volver a editar los hitos. La versión confirmada actual queda como historial. ¿Confirmás?';
      document.getElementById('reabrirPlanModal').classList.add('open');
      return;
    }

    if (e.target.closest('#btnConfirmReabrir')){
      const { error } = await sb.rpc('plan_hitos_reabrir', { p_request_id: REQ_ID });
      document.getElementById('reabrirPlanModal').classList.remove('open');
      if (error){ toast('err', 'No se pudo reabrir', error.message); return; }
      toast('ok', 'Plan reabierto', 'Ya podés volver a editar los hitos.');
      await loadAll();
      return;
    }

    if (e.target.closest('[data-close-reabrir-modal]') || e.target.id === 'reabrirPlanModal'){
      document.getElementById('reabrirPlanModal').classList.remove('open');
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

  document.getElementById('mPlazoPropio').addEventListener('change', (e) => {
    document.getElementById('mPlazoPropioField').style.display = e.target.checked ? '' : 'none';
  });

  document.getElementById('mPlazoDefault').addEventListener('change', async (e) => {
    const dias = e.target.value ? Number(e.target.value) : null;
    const { error } = await sb.from('obra_preparacion').update({ plazo_observacion_dias_default: dias }).eq('request_id', REQ_ID);
    if (error){ toast('err', 'No se pudo guardar el plazo', error.message); return; }
    STATE.prep.plazo_observacion_dias_default = dias;
    toast('ok', 'Plazo por defecto actualizado', dias ? `${dias} días` : 'Sin definir');
    renderPlanHitos();
  });

  document.getElementById('newMilestoneForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const titulo = document.getElementById('mTitulo').value.trim();
    const descripcion = document.getElementById('mDescripcion').value.trim();
    const criterioAceptacion = document.getElementById('mCriterioAceptacion').value.trim();
    const monto = Number(document.getElementById('mMonto').value);
    const fecha = document.getElementById('mFecha').value || null;
    const responsableValue = document.getElementById('mResponsable').value;
    const plazoPropio = document.getElementById('mPlazoPropio').checked;
    const plazoDias = document.getElementById('mPlazoDias').value ? Number(document.getElementById('mPlazoDias').value) : null;

    if (!titulo || !monto){ toast('err', 'Faltan datos', 'Título y monto son obligatorios.'); return; }
    if (!descripcion){ toast('err', 'Falta el resultado esperado', 'Es obligatorio.'); return; }
    if (!criterioAceptacion){ toast('err', 'Falta el criterio de aceptación', 'Es obligatorio.'); return; }
    if (!responsableValue){ toast('err', 'Falta el responsable', 'Elegí quién responde por este hito.'); return; }
    if (plazoPropio && !plazoDias){ toast('err', 'Falta el plazo propio', 'Cargá los días o destildá "plazo propio".'); return; }

    const equipoMember = responsableValue === '__yo__' ? null : STATE.equipo.find(p => p.id === responsableValue);
    const responsableNombre = responsableValue === '__yo__'
      ? (((SESSION.firstName || '') + ' ' + (SESSION.lastName || '')).trim() || 'Contratista')
      : (equipoMember?.nombre || '');
    const responsableEquipoId = responsableValue === '__yo__' ? null : responsableValue;

    const numero = (STATE.hitos[STATE.hitos.length - 1]?.numero || 0) + 1;
    const { error } = await sb.from('hitos').insert({
      request_id: REQ_ID, numero, titulo, descripcion, monto, fecha_estimada: fecha,
      criterio_aceptacion: criterioAceptacion,
      responsable_nombre: responsableNombre, responsable_equipo_id: responsableEquipoId,
      plazo_propio: plazoPropio, plazo_observacion_dias: plazoPropio ? plazoDias : null
    });
    if (error){ toast('err', 'No se pudo agregar', error.message); return; }
    e.target.reset();
    document.getElementById('mPlazoPropioField').style.display = 'none';
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

/* ── Contrato: preview modal y descarga final ────────────────────────── */
function openContratoPreview(payload, titulo){
  document.getElementById('contratoPreviewTitle').textContent = titulo;
  document.getElementById('contratoPreviewBody').innerHTML = window.renderContratoHTML(payload);
  document.getElementById('contratoPreviewModal').classList.add('open');
}

function downloadContratoFinal(version){
  const meta = `Versión ${version.version} · Firmado ${new Date(version.firmado_at).toLocaleString('es-AR')} · Hash ${version.hash.slice(0, 16)}…`;
  const html = window.renderContratoHTML(version.payload, meta);
  const win = window.open('', '_blank');
  if (!win){ toast('err', 'No se pudo abrir la vista', 'Habilitá los pop-ups para descargar el contrato final.'); return; }
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Contrato firmado — v${version.version}</title></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

/* ── Plan por hitos: payload + hash (mismo mecanismo que el contrato) ── */
async function buildPlanHitosPayload(){
  const payload = {
    plazo_observacion_dias_default: STATE.prep.plazo_observacion_dias_default,
    hitos: STATE.hitos.map(h => ({
      numero: h.numero, titulo: h.titulo, descripcion: h.descripcion, monto: h.monto,
      fecha_estimada: h.fecha_estimada, criterio_aceptacion: h.criterio_aceptacion,
      responsable_nombre: h.responsable_nombre, responsable_equipo_id: h.responsable_equipo_id,
      plazo_propio: h.plazo_propio, plazo_observacion_dias: h.plazo_observacion_dias
    }))
  };
  const hash = await window.sha256Hex(window.canonicalStringify(payload));
  return { payload, hash };
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
