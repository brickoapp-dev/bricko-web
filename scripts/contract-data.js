/* contract-data.js — Capa de datos del contrato: arma un único objeto
   leyendo cada campo desde su pantalla de origen (ver contract-fields.js)
   en vez de volver a pedirlo. Requiere que scripts/contract-fields.js ya
   esté cargado (window.BRICKO_FIELDS / window.BRICKO_ORIGEN_SCREENS). */

const CONTRACT_SB = window.supabase_client;

function joinName(first, last) {
  const full = [first, last].filter(Boolean).join(' ').trim();
  return full || null;
}

function tipoRubroLabel(request) {
  if (request?.rubros && request.rubros.length) return request.rubros.join(', ');
  return request?.tipo_construccion || null;
}

function dniCuitLabel(profile) {
  if (!profile) return null;
  if (profile.tipo_persona === 'juridica') return profile.cuit || null;
  return profile.cuit ? `${profile.dni} (CUIT ${profile.cuit})` : (profile.dni || null);
}

function domicilioContractual(profile) {
  if (!profile) return null;
  if (profile.usa_domicilio_alt && profile.domicilio_contractual_alt) return profile.domicilio_contractual_alt;
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
  if (verif.usa_domicilio_alt && verif.domicilio_contractual_alt) return verif.domicilio_contractual_alt;
  return verif.direccion || null;
}

function caracterInmuebleLabel(profile) {
  if (!profile?.caracter_inmueble) return null;
  if (profile.caracter_inmueble === 'propietario') return 'Propietario';
  return profile.caracter_inmueble_aclaracion
    ? `${profile.caracter_inmueble} (${profile.caracter_inmueble_aclaracion})`
    : profile.caracter_inmueble;
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
    .select('id, ticket_id, titulo, direccion, tipo, rubros, tipo_construccion, superficie, descripcion, user_id, status')
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
    { data: clientProfile },
    { data: proProfile },
    { data: proVerif },
    { data: quote },
    { data: hitos }
  ] = await Promise.all([
    sb.from('profiles')
      .select('first_name, last_name, razon_social, tipo_persona, dni, cuit, address, usa_domicilio_alt, domicilio_contractual_alt, caracter_inmueble, caracter_inmueble_aclaracion')
      .eq('id', request.user_id).single(),
    sb.from('profiles').select('first_name, last_name, razon_social').eq('id', prep.pro_id).single(),
    sb.from('professional_verification')
      .select('dni_number, cuit, condicion_fiscal, direccion, usa_domicilio_alt, domicilio_contractual_alt, matricula_entidad, matricula_numero, matricula_vencimiento, matricula_adjunto_path')
      .eq('id', prep.pro_id).maybeSingle(),
    sb.from('quotes').select('amount').eq('request_id', obraId).eq('pro_id', prep.pro_id).eq('status', 'accepted').maybeSingle(),
    sb.from('hitos').select('*').eq('request_id', obraId).order('numero', { ascending: true })
  ]);

  const hitosList = hitos || [];

  let participantes = [];
  if (hitosList.length) {
    const { data: parts } = await sb
      .from('hito_participantes')
      .select('*')
      .in('hito_id', hitosList.map(h => h.id))
      .order('created_at', { ascending: true });
    participantes = parts || [];
  }

  return {
    obraId,

    // PARTES — comitente [1]-[5]
    cliente_nombre_completo: clientProfile?.razon_social || joinName(clientProfile?.first_name, clientProfile?.last_name),
    cliente_dni_cuit: dniCuitLabel(clientProfile),
    cliente_domicilio: domicilioContractual(clientProfile),
    caracter_inmueble: caracterInmuebleLabel(clientProfile),

    // PARTES — contratista [6]-[11]
    contratista_nombre_completo: proProfile?.razon_social || joinName(proProfile?.first_name, proProfile?.last_name),
    contratista_dni_cuit: dniCuitLabelPro(proVerif),
    contratista_domicilio: domicilioContractualPro(proVerif),
    contratista_condicion_fiscal: proVerif?.condicion_fiscal || null,
    contratista_matricula: matriculaResumen(proVerif),

    // 1. OBJETO [12]-[14]
    obra_direccion_inmueble: request.direccion || null,
    obra_tipo_rubro: tipoRubroLabel(request),
    obra_alcance: request.descripcion || null,

    // 2. PRECIO Y FORMA DE PAGO [16]-[17]
    obra_precio_total: quote?.amount ?? null,
    obra_moneda: 'ARS',

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
    participantes_documentacion: participantes.map(p => p.documentacion_nota).filter(Boolean),

    _raw: { request, prep, clientProfile, proProfile, proVerif, quote, hitos: hitosList, participantes }
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

window.getContractData = getContractData;
window.validateContractData = validateContractData;
window.buildContractPayload = buildContractPayload;
// Reutilizados por el versionado del plan por hitos (T4): mismo mecanismo
// de hash que el contrato, sobre un payload distinto.
window.canonicalStringify = canonicalStringify;
window.sha256Hex = sha256Hex;
