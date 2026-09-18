/* contract-fields.js — Diccionario único de los campos [1]-[31] de
   BRICKO_01_Contrato_Tipo_Referencias.pdf ("los números [1] a [31] son
   las únicas referencias de campos, no se reinician; en las pantallas se
   usan exactamente los mismos números").

   Cada campo se carga una sola vez en su pantalla de origen (perfil del
   cliente, perfil del profesional, datos de la obra, plan por hitos o
   participantes) y el generador de contrato solo lee de ahí -- nunca
   vuelve a pedirlo en un form propio. Si falta un campo obligatorio, el
   generador debe mostrar qué falta y linkear a BRICKO_ORIGEN_SCREENS[origen],
   no abrir un formulario nuevo.

   estado de cada campo:
   - 'definido'            → existe una columna real y ya es legible desde
                             la pantalla de origen. Ver `fuente`.
   - 'existe_no_expuesto'  → el dato ya lo cargó el usuario (ej. el email
                             al registrarse) pero vive en auth.users y hoy
                             no es legible entre usuarios (RLS) -- falta
                             exponerlo (columna redundante o RPC), no
                             volver a pedirlo en un form.
   - 'pendiente'           → no existe ninguna tabla/pantalla que lo
                             recolecte todavía. Sin inventar contenido:
                             declarado como stub con TODO citando la
                             sección del PDF. */

window.BRICKO_ORIGEN_SCREENS = {
  perfil_cliente: () => 'client-perfil.html',
  perfil_profesional: () => 'properfil.html',
  obra: (obraId) => `pro-preobra.html?req=${obraId}`,
  plan_hitos: (obraId) => `pro-preobra.html?req=${obraId}&gate=4`,
  participantes: (obraId) => `pro-preobra.html?req=${obraId}&gate=5`,
  // [12]-[14],[16],[20]-[21]: se completan al cotizar (pro-cotizar.html),
  // no en una pantalla propia del contrato -- casi nunca deberían faltar
  // (pro-cotizar.js ya exige monto/descripción antes de dejar enviar la
  // oferta). Si post-adjudicación llegaran a faltar no hay pantalla real
  // que los corrija (la oferta ya está aceptada y congelada).
  oferta: (obraId) => `pro-preobra.html?req=${obraId}`
};

function stubField(id, estado, { clave = null, label = null, origen = null, alimenta = null, todo }) {
  return {
    id, estado, clave, label, origen,
    tipo: null, requerido: null, lista: null, fuente: null,
    alimenta, todo
  };
}

/* REQUISITOS_POR_MODALIDAD (T5) — mapa modalidad -> documentos exigidos
   para el campo [30]. Espejo de la tabla modalidad_requisitos en SQL
   (ver migración 20260902170000_participante_documentos.sql) -- los
   `tipo` tienen que coincidir exactamente con los de esa tabla. PADIC
   se pide únicamente en 'colaborador_independiente', en ninguna otra
   modalidad. El campo libre único de "documentación/nota" no cumple
   ningún requisito de esta lista -- cada uno se satisface con su
   propio documento tipado (adjunto + vigencia) en participante_documentos. */
window.REQUISITOS_POR_MODALIDAD = {
  colaborador_independiente: [
    { tipo: 'padic_aceptado', label: 'PADIC aceptado' },
    { tipo: 'cuit_activo', label: 'CUIT activo' },
    { tipo: 'asignacion_hito', label: 'Asignación al hito' },
    { tipo: 'factura_propia', label: 'Factura propia' }
  ],
  dependiente: [
    { tipo: 'registracion_laboral', label: 'Registración laboral (ARCA)' },
    { tipo: 'cobertura_riesgos', label: 'Cobertura de riesgos correspondiente' }
  ],
  subcontratista: [
    { tipo: 'contrato', label: 'Contrato' },
    { tipo: 'cuit', label: 'CUIT' },
    { tipo: 'facturacion', label: 'Facturación' },
    { tipo: 'documentacion_tecnica', label: 'Documentación técnica aplicable' }
  ],
  profesional: [
    { tipo: 'matricula', label: 'Matrícula' },
    { tipo: 'contrato_profesional', label: 'Contrato profesional' },
    { tipo: 'documentacion_colegial_previsional', label: 'Documentación colegial/previsional aplicable' }
  ]
};

window.DOC_ESTADO_LABEL = {
  vigente: 'Vigente', por_vencer: 'Por vencer', vencido: 'Vencido', faltante: 'Faltante'
};

window.BRICKO_FIELDS = [
  // ── PARTES: COMITENTE (cliente) — [1]-[5] ──────────────────────────
  {
    id: 1, estado: 'definido', clave: 'cliente_nombre_completo',
    label: 'Nombre / razón social del comitente', origen: 'perfil_cliente',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['razon_social', 'first_name', 'last_name'] }
  },
  // T1: client-perfil.html agrega tipo_persona/dni/cuit (persona humana ->
  // DNI con CUIT opcional; persona jurídica -> CUIT obligatorio).
  {
    id: 2, estado: 'definido', clave: 'cliente_dni_cuit',
    label: 'DNI/CUIT del comitente', origen: 'perfil_cliente',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['tipo_persona', 'dni', 'cuit'] }
  },
  {
    id: 3, estado: 'definido', clave: 'cliente_domicilio',
    label: 'Domicilio contractual del comitente', origen: 'perfil_cliente',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['address', 'usa_domicilio_alt', 'domicilio_contractual'] }
  },
  // Resuelto: profiles.email (poblada por handle_new_user + backfill) y
  // expuesta entre las dos partes de una obra vía get_contract_parties_email()
  // -- ver …_expone_email_contrato.sql. Antes era 'existe_no_expuesto'.
  {
    id: 4, estado: 'definido', clave: 'cliente_email',
    label: 'Correo del comitente', origen: 'perfil_cliente',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['email'] }
  },
  // T1: client-perfil.html agrega caracter_inmueble (select obligatorio) +
  // caracter_inmueble_detalle (obligatoria si no es "propietario").
  // Corrige el origen respecto de la primera versión de este diccionario:
  // se decidió que viva en el perfil general del cliente, no por obra.
  {
    id: 5, estado: 'definido', clave: 'caracter_inmueble',
    label: 'Carácter respecto del inmueble', origen: 'perfil_cliente',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['caracter_inmueble', 'caracter_inmueble_detalle'] }
  },

  // ── PARTES: CONTRATISTA (profesional) — [6]-[11] (T2) ──────────────
  {
    id: 6, estado: 'definido', clave: 'contratista_nombre_completo',
    label: 'Nombre / razón social del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['razon_social', 'first_name', 'last_name'] }
  },
  {
    id: 7, estado: 'definido', clave: 'contratista_dni_cuit',
    label: 'DNI/CUIT del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'professional_verification', columnas: ['dni_number', 'cuit', 'condicion_fiscal'] }
  },
  {
    id: 8, estado: 'definido', clave: 'contratista_domicilio',
    label: 'Domicilio contractual del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'professional_verification', columnas: ['direccion', 'usa_domicilio_alt', 'domicilio_contractual'] }
  },
  // Resuelto: mismo mecanismo que [4].
  {
    id: 9, estado: 'definido', clave: 'contratista_email',
    label: 'Correo del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['email'] }
  },
  {
    id: 10, estado: 'definido', clave: 'contratista_condicion_fiscal',
    label: 'Condición fiscal del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'professional_verification', columnas: ['condicion_fiscal'] }
  },
  {
    id: 11, estado: 'definido', clave: 'contratista_matricula',
    label: 'Matrícula / registro profesional del contratista', origen: 'perfil_profesional',
    // requerido:false -- "Profesionales de la construcción" (el rubro que
    // la vuelve obligatoria según la consigna de T2) no existe como valor
    // en los 8 chips de rubro de properfil.html. Sin ese mapeo quedaría
    // obligatorio para todos o para ninguno -- se dejó opcional para
    // todos por ahora, ver TODO en properfil.js/README de la tarea.
    tipo: 'text', requerido: false, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'professional_verification', columnas: ['matricula_entidad', 'matricula_numero', 'matricula_vencimiento', 'matricula_adjunto'] }
  },

  // ── 1. OBJETO — [12]-[15] ───────────────────────────────────────────
  // [12]-[14]: resuelto -- el profesional ya carga dirección (viene de la
  // solicitud), rubro/tipo (idem) y alcance (lo que él mismo describe al
  // cotizar, quotes.description) al momento de ofertar. La REDACCIÓN
  // LEGAL final de esta cláusula sigue sujeta al documento 01 de la serie
  // (BRICKO_01_Contrato_Tipo_Referencias.pdf) cuando exista -- por eso el
  // render muestra estos valores con una nota de "sujeto a redacción legal
  // final", no como texto contractual cerrado. [15] (exclusiones) sigue
  // sin ninguna fuente de datos -- queda pendiente.
  {
    id: 12, estado: 'definido', clave: 'objeto_direccion',
    label: 'Dirección del inmueble', origen: 'oferta',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'requests', columnas: ['direccion'] }
  },
  {
    id: 13, estado: 'definido', clave: 'objeto_rubro',
    label: 'Tipo/rubro del trabajo', origen: 'oferta',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'requests', columnas: ['tipo', 'rubros'] }
  },
  {
    id: 14, estado: 'definido', clave: 'objeto_alcance',
    label: 'Alcance contratado', origen: 'oferta',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'quotes', columnas: ['description'] }
  },
  stubField(15, 'pendiente', {
    origen: 'obra', alimenta: 'contrato',
    todo: 'TODO (OBJETO): exclusiones del alcance contratado. No existe ningún campo de "exclusiones" en requests/quotes hoy.'
  }),

  // ── 2. PRECIO Y FORMA DE PAGO — [16]-[19] ───────────────────────────
  // [16]: resuelto -- monto de la oferta (quotes.amount). [17]-[19] no
  // tienen fuente de datos todavía (moneda siempre fue implícitamente
  // ARS pero nunca se pidió como campo explícito; impuestos/anticipo no
  // se recolectan en ninguna pantalla) -- quedan pendientes.
  {
    id: 16, estado: 'definido', clave: 'precio_total',
    label: 'Precio total', origen: 'oferta',
    tipo: 'number', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'quotes', columnas: ['amount'] }
  },
  stubField(17, 'pendiente', {
    origen: 'obra', alimenta: 'contrato',
    todo: 'TODO (PRECIO): moneda. El PDF referencia [17] pero no lo define -- falta el documento 01 de la serie (cuerpo del contrato marco).'
  }),
  stubField(18, 'pendiente', {
    origen: 'obra', alimenta: 'contrato',
    todo: 'TODO (PRECIO): tratamiento de impuestos. No se recolecta en ninguna pantalla hoy.'
  }),
  stubField(19, 'pendiente', {
    origen: 'obra', alimenta: 'contrato',
    todo: 'TODO (PRECIO): anticipo / forma inicial de pago. Los hitos definen pagos escalonados pero no hay un concepto explícito de "anticipo" separado del primer hito.'
  }),

  // ── 3. PLAZO — [20]-[21] ────────────────────────────────────────────
  // Resuelto de forma aproximada: pro-cotizar.js solo recolecta un plazo
  // en TEXTO LIBRE (ej. "15 días", "2 semanas"), no fechas calendario
  // reales -- no existe ningún date-picker de inicio/fin de obra hoy. En
  // vez de inventar dos fechas exactas que nadie cargó, [20] y [21]
  // muestran el mismo texto de plazo propuesto por el profesional
  // (quotes.features[0]), con la aclaración de que las fechas concretas
  // se coordinan al iniciar. Ver contract-render.js sección PLAZO.
  {
    id: 20, estado: 'definido', clave: 'plazo_estimado',
    label: 'Plazo estimado de ejecución', origen: 'oferta',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'quotes', columnas: ['features'] }
  },
  {
    id: 21, estado: 'definido', clave: 'plazo_estimado',
    label: 'Plazo estimado de ejecución', origen: 'oferta',
    tipo: 'text', requerido: false, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'quotes', columnas: ['features'] }
  },

  // ── 4. HITOS Y ENTREGABLES — [22]-[27] (se repiten por hito) ───────
  {
    id: 22, estado: 'definido', clave: 'hito_titulo',
    label: 'Título del hito', origen: 'plan_hitos',
    tipo: 'text', requerido: true, alimenta: 'anexo_hitos', lista: true,
    fuente: { tabla: 'hitos', columnas: ['titulo'] }
  },
  {
    id: 23, estado: 'definido', clave: 'hito_resultado_verificable',
    label: 'Resultado verificable del hito', origen: 'plan_hitos',
    tipo: 'text', requerido: true, alimenta: 'anexo_hitos', lista: true,
    fuente: { tabla: 'hitos', columnas: ['descripcion'] }
  },
  {
    id: 24, estado: 'definido', clave: 'hito_monto',
    label: 'Monto del hito', origen: 'plan_hitos',
    tipo: 'number', requerido: true, alimenta: 'anexo_hitos', lista: true,
    fuente: { tabla: 'hitos', columnas: ['monto'] }
  },
  {
    id: 25, estado: 'definido', clave: 'hito_fecha_objetivo',
    label: 'Fecha objetivo del hito', origen: 'plan_hitos',
    tipo: 'date', requerido: true, alimenta: 'anexo_hitos', lista: true,
    fuente: { tabla: 'hitos', columnas: ['fecha_estimada'] }
  },
  {
    id: 26, estado: 'definido', clave: 'hito_criterio_aceptacion',
    label: 'Criterio de aceptación del hito', origen: 'plan_hitos',
    tipo: 'text', requerido: true, alimenta: 'anexo_hitos', lista: true,
    fuente: { tabla: 'hitos', columnas: ['criterio_aceptacion'] }
  },
  {
    id: 27, estado: 'definido', clave: 'hito_responsable',
    label: 'Responsable del hito', origen: 'plan_hitos',
    tipo: 'text', requerido: true, alimenta: 'anexo_hitos', lista: true,
    fuente: { tabla: 'hitos', columnas: ['responsable_nombre', 'responsable_equipo_id'] }
  },

  // ── 5. MATERIALES — [28] ────────────────────────────────────────────
  stubField(28, 'pendiente', {
    origen: null, alimenta: 'anexo_materiales',
    todo: 'TODO (MATERIALES): materiales incluidos/excluidos y responsable de proveerlos. No existe ninguna tabla de materiales en el esquema hoy -- hace falta modelo de datos y pantalla antes de poder mapear esto.'
  }),

  // ── 6. EQUIPO Y MODALIDAD DE PARTICIPACIÓN — [29]-[30] ─────────────
  {
    id: 29, estado: 'definido', clave: 'participantes_listado',
    label: 'Equipo de la obra (nombre, función/tarea, modalidad)', origen: 'participantes',
    tipo: 'text', requerido: true, alimenta: 'anexo_equipo', lista: true,
    fuente: { tabla: 'participantes', columnas: ['nombre', 'especialidad', 'modalidad'] }
  },
  {
    // T5: ya no sale de un campo libre único (participantes.observaciones,
    // ex documentacion_nota) -- cada participante tiene un documento
    // tipado por requisito de su modalidad (ver REQUISITOS_POR_MODALIDAD
    // más arriba), con adjunto + vigencia, en participante_documentos.
    id: 30, estado: 'definido', clave: 'participantes_documentacion',
    label: 'Documentación exigible por modalidad (adjunto + vigencia)', origen: 'participantes',
    tipo: 'text', requerido: true, alimenta: 'anexo_equipo', lista: true,
    fuente: { tabla: 'participante_documentos', columnas: ['tipo', 'storage_path', 'fecha_emision', 'fecha_vencimiento'] }
  },

  // ── 4. HITOS Y ENTREGABLES (cont.) — [31] (T4) ─────────────────────
  // Un valor por hito: plazo_observacion_dias propio si plazo_propio,
  // si no el default de la obra (obra_preparacion.plazo_observacion_dias_default).
  {
    id: 31, estado: 'definido', clave: 'plazo_observacion_dias',
    label: 'Plazo de observación del hito (días)', origen: 'plan_hitos',
    tipo: 'number', requerido: true, alimenta: 'anexo_hitos', lista: true,
    fuente: { tabla: 'hitos', columnas: ['plazo_propio', 'plazo_observacion_dias'], fallback: { tabla: 'obra_preparacion', columna: 'plazo_observacion_dias_default' } }
  }
];
