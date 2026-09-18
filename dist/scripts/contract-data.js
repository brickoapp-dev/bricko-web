/* contract-data.js — Capa de datos del contrato: arma un único objeto
   leyendo cada campo desde su pantalla de origen (ver contract-fields.js)
   en vez de volver a pedirlo. Requiere que scripts/contract-fields.js ya
   esté cargado (window.BRICKO_FIELDS / window.BRICKO_ORIGEN_SCREENS). */

const CONTRACT_SB = window.supabase_client;

function joinName(first, last) {
  const full = [first, last].filter(Boolean).join(' ').trim();
  return full || null;
}

function dniCuitLabel(profile) {
  if (!profile) return null;
  if (profile.tipo_persona === 'juridica') return profile.cuit || null;
  return profile.cuit ? `${profile.dni} (CUIT ${profile.cuit})` : (profile.dni || null);
}

function domicilioContractual(profile) {
  if (!profile) return null;
  if (profile.usa_domicilio_alt && profile.domicilio_contractual) return profile.domicilio_contractual;
  return profile.address || null;
}

function dniCuitLabelPro(verif) {
  if (!verif) return null;
  const factura = ['responsable_inscripto', 'monotributo'].includes(verif.condicion_fiscal);
  if (factura) return verif.cuit || null;
  return verif.cuit ? `${verif.dni_number} (CUIT ${verif.cuit})` : (verif.dni_number || null);
}

function domicilioContractualPro(verif) {
  if (!verif) return null;
  if (verif.usa_domicilio_alt && verif.domicilio_contractual) return verif.domicilio_contractual;
  return verif.direccion || null;
}

/* Espejo en JS de public.documento_estado() -- mismas reglas, para no
   depender de un round-trip solo para mostrar el resumen en el
   contrato (la fuente de verdad real sigue siendo participantes.estado,
   calculado en la base por recalcular_estado_participante()). */
function documentoEstadoJS(storagePath, fechaVencimiento) {
  if (!storagePath) return 'faltante';
  if (!fechaVencimiento) return 'vigente';
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVencimiento + 'T00:00:00');
  const diffDias = Math.round((venc - hoy) / 86400000);
  if (diffDias < 0) return 'vencido';
  if (diffDias <= 30) return 'por_vencer';
  return 'vigente';
}

function resumenDocumentacionParticipante(participante, docsDeEsteParticipante) {
  const requisitos = window.REQUISITOS_POR_MODALIDAD?.[participante.modalidad] || [];
  if (!requisitos.length) return `${participante.nombre}: sin requisitos definidos para "${participante.modalidad}"`;
  const porTipo = {};
  docsDeEsteParticipante.forEach(d => { porTipo[d.tipo] = d; });
  const detalle = requisitos.map(req => {
    const doc = porTipo[req.tipo];
    const estado = documentoEstadoJS(doc?.storage_path, doc?.fecha_vencimiento);
    return `${req.label}: ${window.DOC_ESTADO_LABEL[estado]}`;
  }).join(', ');
  return `${participante.nombre} (${participante.modalidad}): ${detalle}`;
}

function caracterInmuebleLabel(profile) {
  if (!profile?.caracter_inmueble) return null;
  if (profile.caracter_inmueble === 'propietario') return 'Propietario';
  return profile.caracter_inmueble_detalle
    ? `${profile.caracter_inmueble} (${profile.caracter_inmueble_detalle})`
    : profile.caracter_inmueble;
}

/* [12]-[14],[16],[20]-[21]: resueltos con datos de la oferta (quotes) y
   de la obra (requests) -- ver contract-fields.js. La redacción legal
   final de estas cláusulas sigue sujeta al documento 01 de la serie
   (BRICKO_01_Contrato_Tipo_Referencias.pdf); por eso contract-render.js
   las muestra con la aclaración correspondiente, no como texto cerrado. */
const CD_RUBRO_LABELS = {
  plomeria: 'Plomería', gas: 'Gas', electricidad: 'Electricidad',
  albanileria: 'Albañilería', pintura: 'Pintura', carpinteria: 'Carpintería',
  herreria: 'Herrería', jardineria: 'Jardinería', 'multi-gremio': 'Multi-gremio'
};
const CD_TIPO_LABEL = { refaccion: 'Refacción', 'obra-nueva': 'Obra Nueva' };

function objetoRubroLabel(request) {
  if (!request) return null;
  const tipo = CD_TIPO_LABEL[request.tipo] || request.tipo;
  const rubros = (request.rubros || []).map(r => CD_RUBRO_LABELS[r] || r).join(', ');
  return rubros ? `${tipo} — ${rubros}` : tipo || null;
}

function plazoEstimadoLabel(quote) {
  return quote?.features?.[0] || null;
}

/* dniCuitLabel/domicilioContractual ya cubren el mismo patrón para
   professional_verification (mismos nombres de columna que profiles). */

function matriculaResumen(verif) {
  if (!verif?.matricula_entidad && !verif?.matricula_numero) return null;
  const partes = [verif.matricula_entidad, verif.matricula_numero].filter(Boolean).join(' · ');
  return verif.matricula_vencimiento ? `${partes} (vence ${verif.matricula_vencimiento})` : partes;
}

/* Arma el objeto único de datos de contrato para una obra (request_id).
   Lee perfil del cliente, perfil del contratista, datos de la obra, el
   precio adjudicado, hitos y participantes -- una sola vuelta de
   queries, sin volver a pedirle nada al usuario. Los campos con
   estado !== 'definido' en BRICKO_FIELDS (ver contract-fields.js) no
   tienen ninguna fuente real todavía y por eso no aparecen acá. */
async function getContractData(obraId) {
  const sb = CONTRACT_SB;

  const { data: request, error: reqErr } = await sb
    .from('requests')
    .select('id, ticket_id, titulo, tipo, rubros, direccion, superficie, user_id, status')
    .eq('id', obraId)
    .single();
  if (reqErr || !request) throw new Error(`Obra ${obraId} no encontrada`);

  const { data: prep, error: prepErr } = await sb
    .from('obra_preparacion')
    .select('*')
    .eq('request_id', obraId)
    .maybeSingle();
  if (prepErr || !prep) throw new Error(`La obra ${obraId} todavía no tiene una propuesta aceptada`);

  const [
    { data: clientProfileRows },
    { data: proProfile },
    { data: proVerif },
    { data: hitos },
    { data: emails },
    { data: quote }
  ] = await Promise.all([
    // No es un SELECT directo a "profiles": profiles_select_own solo deja
    // leer el propio perfil, y esta función la llama el profesional para
    // leer el perfil del CLIENTE (mismo problema que ya se había resuelto
    // para nombre/ciudad en pro-dashboard.js vía get_request_owners()).
    sb.rpc('get_contract_client_profile', { p_request_id: obraId }),
    sb.from('profiles').select('first_name, last_name, razon_social').eq('id', prep.pro_id).single(),
    sb.from('professional_verification')
      .select('dni_number, cuit, condicion_fiscal, direccion, usa_domicilio_alt, domicilio_contractual, matricula_entidad, matricula_numero, matricula_vencimiento, matricula_adjunto')
      .eq('id', prep.pro_id).maybeSingle(),
    sb.from('hitos').select('*').eq('request_id', obraId).is('quote_id', null).order('numero', { ascending: true }),
    sb.rpc('get_contract_parties_email', { p_request_id: obraId }),
    // [12]-[14],[16],[20]-[21]: la oferta ganadora ya tiene esta información
    // desde que se cotizó -- no hace falta volver a pedirla en ninguna
    // pantalla post-adjudicación.
    sb.from('quotes').select('amount, description, features').eq('request_id', obraId).eq('status', 'accepted').maybeSingle()
  ]);

  const clientProfile = clientProfileRows?.[0] || null;

  const hitosList = hitos || [];

  let participantes = [];
  if (hitosList.length) {
    const { data: parts } = await sb
      .from('participantes')
      .select('*')
      .in('hito_id', hitosList.map(h => h.id))
      .order('created_at', { ascending: true });
    participantes = parts || [];
  }

  let participanteDocs = [];
  if (participantes.length) {
    const { data: docs } = await sb
      .from('participante_documentos')
      .select('*')
      .in('participante_id', participantes.map(p => p.id));
    participanteDocs = docs || [];
  }

  return {
    obraId,

    // PARTES — comitente [1]-[5]
    cliente_nombre_completo: clientProfile?.razon_social || joinName(clientProfile?.first_name, clientProfile?.last_name),
    cliente_dni_cuit: dniCuitLabel(clientProfile),
    cliente_domicilio: domicilioContractual(clientProfile),
    cliente_email: emails?.cliente_email || null,
    caracter_inmueble: caracterInmuebleLabel(clientProfile),

    // PARTES — contratista [6]-[11]
    contratista_nombre_completo: proProfile?.razon_social || joinName(proProfile?.first_name, proProfile?.last_name),
    contratista_dni_cuit: dniCuitLabelPro(proVerif),
    contratista_domicilio: domicilioContractualPro(proVerif),
    contratista_email: emails?.contratista_email || null,
    contratista_condicion_fiscal: proVerif?.condicion_fiscal || null,
    contratista_matricula: matriculaResumen(proVerif),

    // OBJETO [12]-[14], PRECIO [16] y PLAZO [20]-[21]: resueltos con la
    // oferta ganadora -- ver nota arriba de CD_RUBRO_LABELS. [15],[17]-[19],[28]
    // siguen pendientes, ver contract-fields.js.
    objeto_direccion: request.direccion || null,
    objeto_rubro: objetoRubroLabel(request),
    objeto_alcance: quote?.description || null,
    precio_total: quote?.amount ?? null,
    plazo_estimado: plazoEstimadoLabel(quote),

    // 4. HITOS Y ENTREGABLES [22]-[27],[31] (uno por hito)
    hito_titulo: hitosList.map(h => h.titulo),
    hito_resultado_verificable: hitosList.map(h => h.descripcion),
    hito_monto: hitosList.map(h => h.monto),
    hito_fecha_objetivo: hitosList.map(h => h.fecha_estimada),
    hito_criterio_aceptacion: hitosList.map(h => h.criterio_aceptacion),
    hito_responsable: hitosList.map(h => h.responsable_nombre || null),
    plazo_observacion_dias: hitosList.map(h => (h.plazo_propio ? h.plazo_observacion_dias : prep.plazo_observacion_dias_default) ?? null),

    // 6. EQUIPO Y MODALIDAD DE PARTICIPACIÓN [29]-[30]
    participantes_listado: participantes.map(p => ({ hito_id: p.hito_id, nombre: p.nombre, especialidad: p.especialidad, modalidad: p.modalidad })),
    participantes_documentacion: participantes.map(p =>
      resumenDocumentacionParticipante(p, participanteDocs.filter(d => d.participante_id === p.id))
    ),

    _raw: { request, prep, clientProfile, proProfile, proVerif, quote, hitos: hitosList, participantes, participanteDocs }
  };
}

/* Misma forma de objeto que getContractData(), pero para ANTES de la
   adjudicación -- se usa desde pro-cotizar.html, donde todavía no existe
   obra_preparacion (recién se crea al aceptar una quote). Lee precio/
   alcance/plazo de la propia quote (en vez de la aceptada) y los hitos
   preliminares que el profesional cargó para ESTA oferta (quote_id, no
   request_id todavía "confirmados"). Nunca hay participantes en esta
   etapa -- el equipo se asigna recién post-adjudicación (gate 5) -- por
   eso participantes_listado/participantes_documentacion van siempre
   vacíos acá; validateContractDataForQuote() no los exige.

   Devuelve EXACTAMENTE las mismas claves que getContractData() para que,
   una vez adjudicada la oferta, el hash recalculado post-adjudicación
   coincida con el que se congeló al enviar la oferta (si nada cambió) --
   ver contrato_invalidar_si_cambio() / accept_quote(). */
async function getContractDataForQuote(quoteId) {
  const sb = CONTRACT_SB;

  const { data: quote, error: quoteErr } = await sb
    .from('quotes')
    .select('id, request_id, pro_id, amount, description, features')
    .eq('id', quoteId)
    .single();
  if (quoteErr || !quote) throw new Error(`Oferta ${quoteId} no encontrada`);

  const { data: request, error: reqErr } = await sb
    .from('requests')
    .select('id, ticket_id, titulo, tipo, rubros, direccion, superficie, user_id, status')
    .eq('id', quote.request_id)
    .single();
  if (reqErr || !request) throw new Error(`Obra ${quote.request_id} no encontrada`);

  const [
    { data: clientProfileRows },
    { data: proProfile },
    { data: proVerif },
    { data: hitos },
    { data: emails }
  ] = await Promise.all([
    sb.rpc('get_contract_client_profile', { p_request_id: quote.request_id }),
    sb.from('profiles').select('first_name, last_name, razon_social').eq('id', quote.pro_id).single(),
    sb.from('professional_verification')
      .select('dni_number, cuit, condicion_fiscal, direccion, usa_domicilio_alt, domicilio_contractual, matricula_entidad, matricula_numero, matricula_vencimiento, matricula_adjunto')
      .eq('id', quote.pro_id).maybeSingle(),
    sb.from('hitos').select('*').eq('quote_id', quoteId).order('numero', { ascending: true }),
    sb.rpc('get_contract_parties_email', { p_request_id: quote.request_id })
  ]);

  const clientProfile = clientProfileRows?.[0] || null;
  const hitosList = hitos || [];

  return {
    obraId: quote.request_id,

    cliente_nombre_completo: clientProfile?.razon_social || joinName(clientProfile?.first_name, clientProfile?.last_name),
    cliente_dni_cuit: dniCuitLabel(clientProfile),
    cliente_domicilio: domicilioContractual(clientProfile),
    cliente_email: emails?.cliente_email || null,
    caracter_inmueble: caracterInmuebleLabel(clientProfile),

    contratista_nombre_completo: proProfile?.razon_social || joinName(proProfile?.first_name, proProfile?.last_name),
    contratista_dni_cuit: dniCuitLabelPro(proVerif),
    contratista_domicilio: domicilioContractualPro(proVerif),
    contratista_email: emails?.contratista_email || null,
    contratista_condicion_fiscal: proVerif?.condicion_fiscal || null,
    contratista_matricula: matriculaResumen(proVerif),

    objeto_direccion: request.direccion || null,
    objeto_rubro: objetoRubroLabel(request),
    objeto_alcance: quote.description || null,
    precio_total: quote.amount ?? null,
    plazo_estimado: plazoEstimadoLabel(quote),

    hito_titulo: hitosList.map(h => h.titulo),
    hito_resultado_verificable: hitosList.map(h => h.descripcion),
    hito_monto: hitosList.map(h => h.monto),
    hito_fecha_objetivo: hitosList.map(h => h.fecha_estimada),
    hito_criterio_aceptacion: hitosList.map(h => h.criterio_aceptacion),
    hito_responsable: hitosList.map(h => h.responsable_nombre || null),
    // Mismo default (10) que la columna obra_preparacion.plazo_observacion_dias_default
    // -- ver …_plazo_observacion_default_10dias.sql -- así el hash no
    // cambia por sí solo apenas se crea obra_preparacion al adjudicar.
    plazo_observacion_dias: hitosList.map(h => (h.plazo_propio ? h.plazo_observacion_dias : 10) ?? null),

    participantes_listado: [],
    participantes_documentacion: [],

    _raw: { request, quote, clientProfile, proProfile, proVerif, hitos: hitosList }
  };
}

/* Devuelve, para cada campo de BRICKO_FIELDS que no está listo, un
   reporte con motivo:
   - 'no_definido' (estado:'pendiente')          → no hay pantalla, ver field.todo.
   - 'no_expuesto' (estado:'existe_no_expuesto') → el dato ya existe pero no es legible desde acá, ver field.todo.
   - 'vacio'       (estado:'definido' pero vacío para esta obra) → falta cargarlo, con link a la pantalla de origen.
   El generador de contrato usa esto para mostrar qué falta y linkear a
   la pantalla de origen -- nunca para abrir un formulario propio. */
async function validateContractData(obraId) {
  const data = await getContractData(obraId);
  const faltantes = [];

  for (const field of window.BRICKO_FIELDS) {
    if (field.estado === 'pendiente') {
      faltantes.push({ id: field.id, clave: null, label: null, origen: field.origen, motivo: 'no_definido', pantalla: null, nota: field.todo });
      continue;
    }
    if (field.estado === 'existe_no_expuesto') {
      faltantes.push({ id: field.id, clave: field.clave, label: field.label, origen: field.origen, motivo: 'no_expuesto', pantalla: null, nota: field.todo });
      continue;
    }
    if (!field.requerido) continue;

    const value = data[field.clave];
    const isEmpty = field.lista
      ? !(Array.isArray(value) && value.length)
      : (value === null || value === undefined || value === '');

    if (isEmpty) {
      const screenFn = window.BRICKO_ORIGEN_SCREENS[field.origen];
      faltantes.push({
        id: field.id, clave: field.clave, label: field.label, origen: field.origen,
        motivo: 'vacio', pantalla: screenFn ? screenFn(obraId) : null
      });
    }
  }

  return faltantes;
}

/* Igual que validateContractData(), pero para el contrato de una oferta
   (pre-adjudicación, ver getContractDataForQuote()). Los campos de
   equipo/participantes [29]-[30] nunca están disponibles en esta etapa
   (el equipo se asigna post-adjudicación, gate 5) -- se tratan como no
   bloqueantes acá, igual que las cláusulas legales pendientes, en vez de
   exigir un dato que ninguna oferta puede tener todavía. */
async function validateContractDataForQuote(quoteId) {
  const data = await getContractDataForQuote(quoteId);
  const faltantes = [];

  for (const field of window.BRICKO_FIELDS) {
    if (field.origen === 'participantes') {
      faltantes.push({ id: field.id, clave: field.clave, label: field.label, origen: field.origen, motivo: 'no_definido', pantalla: null, nota: 'El equipo de la obra se define recién tras la adjudicación.' });
      continue;
    }
    if (field.estado === 'pendiente') {
      faltantes.push({ id: field.id, clave: null, label: null, origen: field.origen, motivo: 'no_definido', pantalla: null, nota: field.todo });
      continue;
    }
    if (field.estado === 'existe_no_expuesto') {
      faltantes.push({ id: field.id, clave: field.clave, label: field.label, origen: field.origen, motivo: 'no_expuesto', pantalla: null, nota: field.todo });
      continue;
    }
    if (!field.requerido) continue;

    const value = data[field.clave];
    const isEmpty = field.lista
      ? !(Array.isArray(value) && value.length)
      : (value === null || value === undefined || value === '');

    if (isEmpty) {
      faltantes.push({ id: field.id, clave: field.clave, label: field.label, origen: field.origen, motivo: 'vacio', pantalla: null });
    }
  }

  return faltantes;
}

/* ── Payload + hash para la máquina de estados del contrato (T3) ────── */
function canonicalStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* payload = getContractData() sin _raw (no hace falta persistir las
   filas crudas, solo los valores ya resueltos que ve el contrato) +
   hash SHA-256 canónico (orden de claves estable, para que el mismo
   contenido siempre dé el mismo hash sin importar el orden de inserción). */
async function buildContractPayload(obraId) {
  const data = await getContractData(obraId);
  const { _raw, ...payload } = data;
  const hash = await sha256Hex(canonicalStringify(payload));
  return { payload, hash };
}

/* Misma idea que buildContractPayload(), para el contrato de una oferta
   antes de la adjudicación (ver getContractDataForQuote()). */
async function buildContractPayloadForQuote(quoteId) {
  const data = await getContractDataForQuote(quoteId);
  const { _raw, ...payload } = data;
  const hash = await sha256Hex(canonicalStringify(payload));
  return { payload, hash };
}

window.getContractData = getContractData;
window.validateContractData = validateContractData;
window.buildContractPayload = buildContractPayload;
window.getContractDataForQuote = getContractDataForQuote;
window.validateContractDataForQuote = validateContractDataForQuote;
window.buildContractPayloadForQuote = buildContractPayloadForQuote;
// Reutilizados por el versionado del plan por hitos (T4): mismo mecanismo
// de hash que el contrato, sobre un payload distinto.
window.canonicalStringify = canonicalStringify;
window.sha256Hex = sha256Hex;
