/* contract-data.js — Capa de datos del contrato: arma un único objeto
   leyendo cada campo desde su pantalla de origen (ver contract-fields.js)
   en vez de volver a pedirlo. Requiere que scripts/contract-fields.js ya
   esté cargado (window.BRICKO_FIELDS / window.BRICKO_ORIGEN_SCREENS). */

const CONTRACT_SB = window.supabase_client;

function joinName(first, last) {
  const full = [first, last].filter(Boolean).join(' ').trim();
  return full || null;
}

function rubroLabel(professional) {
  if (professional?.rubros && professional.rubros.length) return professional.rubros.join(', ');
  return professional?.rubro || null;
}

/* Arma el objeto único de datos de contrato para una obra (request_id).
   Lee perfil del cliente, perfil del contratista, hitos, participantes y
   datos de la obra -- una sola vuelta de queries, sin volver a pedirle
   nada al usuario. */
async function getContractData(obraId) {
  const sb = CONTRACT_SB;

  const { data: request, error: reqErr } = await sb
    .from('requests')
    .select('id, ticket_id, titulo, direccion, tipo, tipo_construccion, superficie, user_id, status')
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
    { data: proDirectory },
    { data: proVerif },
    { data: hitos }
  ] = await Promise.all([
    sb.from('profiles').select('*').eq('id', request.user_id).single(),
    sb.from('profiles').select('*').eq('id', prep.pro_id).single(),
    sb.from('professionals').select('*').eq('id', prep.pro_id).single(),
    sb.from('professional_verification').select('*').eq('id', prep.pro_id).maybeSingle(),
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

    // [1]-[5] perfil del cliente
    cliente_nombre_completo: joinName(clientProfile?.first_name, clientProfile?.last_name),
    cliente_telefono: clientProfile?.phone || null,
    cliente_domicilio: clientProfile?.address || null,
    cliente_localidad: clientProfile?.city || null,
    cliente_provincia: clientProfile?.province || null,

    // [6]-[11] perfil del profesional/contratista
    contratista_nombre_completo: joinName(proProfile?.first_name, proProfile?.last_name),
    contratista_dni: proVerif?.dni_number || null,
    contratista_domicilio: proVerif?.direccion || null,
    contratista_rubro: rubroLabel(proDirectory),
    contratista_telefono: proProfile?.phone || null,
    contratista_localidad: proDirectory?.localidad || proDirectory?.residencia || null,

    // [22]-[27],[31] plan por hitos
    hito_numero: hitosList.map(h => h.numero),
    hito_titulo: hitosList.map(h => h.titulo),
    hito_descripcion: hitosList.map(h => h.descripcion),
    hito_monto: hitosList.map(h => h.monto),
    hito_fecha_estimada: hitosList.map(h => h.fecha_estimada),
    monto_total_hitos: hitosList.reduce((s, h) => s + Number(h.monto || 0), 0),
    cantidad_hitos: hitosList.length,

    // [29]-[30] participantes y documentación
    participantes_listado: participantes.map(p => ({ hito_id: p.hito_id, nombre: p.nombre, modalidad: p.modalidad })),
    participantes_documentacion: participantes.map(p => p.documentacion_nota).filter(Boolean),

    // Datos de la obra: no forman parte de [1]-[31], pero alimentan el
    // encabezado del contrato -- ya se cargaron una sola vez al crear la
    // solicitud, tampoco se le vuelven a pedir al usuario.
    obra: {
      ticket_id: request.ticket_id,
      titulo: request.titulo,
      direccion: request.direccion,
      tipo: request.tipo,
      tipo_construccion: request.tipo_construccion,
      superficie: request.superficie
    },

    _raw: { request, prep, clientProfile, proProfile, proDirectory, proVerif, hitos: hitosList, participantes }
  };
}

/* Devuelve los campos [1]-[31] obligatorios que faltan, cada uno con su
   pantalla de origen -- para que el generador de contrato linkee ahí en
   vez de abrir un formulario propio. Los campos con estado:'pendiente'
   (ver contract-fields.js) se ignoran: todavía no tienen ni pantalla ni
   dato que validar. */
async function validateContractData(obraId) {
  const data = await getContractData(obraId);
  const faltantes = [];

  for (const field of window.BRICKO_FIELDS) {
    if (field.estado === 'pendiente' || !field.requerido) continue;

    const value = data[field.clave];
    const isEmpty = field.lista
      ? !(Array.isArray(value) && value.length)
      : (value === null || value === undefined || value === '');

    if (isEmpty) {
      const screenFn = window.BRICKO_ORIGEN_SCREENS[field.origen];
      faltantes.push({
        id: field.id,
        clave: field.clave,
        label: field.label,
        origen: field.origen,
        pantalla: screenFn ? screenFn(obraId) : null
      });
    }
  }

  return faltantes;
}

window.getContractData = getContractData;
window.validateContractData = validateContractData;
