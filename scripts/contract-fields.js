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
  participantes: (obraId) => `pro-preobra.html?req=${obraId}&gate=5`
};

function stubField(id, estado, { clave = null, label = null, origen = null, alimenta = null, todo }) {
  return {
    id, estado, clave, label, origen,
    tipo: null, requerido: null, lista: null, fuente: null,
    alimenta, todo
  };
}

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
    fuente: { tabla: 'profiles', columnas: ['address', 'usa_domicilio_alt', 'domicilio_contractual_alt'] }
  },
  stubField(4, 'existe_no_expuesto', {
    clave: 'cliente_email', label: 'Correo del comitente', origen: 'perfil_cliente', alimenta: 'contrato',
    todo: 'TODO (PARTES): el cliente ya dio su email al registrarse (auth.users.email), pero profiles no lo guarda y un profesional no puede leer auth.users de otro usuario por RLS. Exponerlo (ej. columna profiles.email poblada por handle_new_user + backfill) en vez de pedirlo de nuevo.'
  }),
  // T1: client-perfil.html agrega caracter_inmueble (select obligatorio) +
  // caracter_inmueble_aclaracion (obligatoria si no es "propietario").
  // Corrige el origen respecto de la primera versión de este diccionario:
  // se decidió que viva en el perfil general del cliente, no por obra.
  {
    id: 5, estado: 'definido', clave: 'caracter_inmueble',
    label: 'Carácter respecto del inmueble', origen: 'perfil_cliente',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['caracter_inmueble', 'caracter_inmueble_aclaracion'] }
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
    fuente: { tabla: 'professional_verification', columnas: ['direccion', 'usa_domicilio_alt', 'domicilio_contractual_alt'] }
  },
  stubField(9, 'existe_no_expuesto', {
    clave: 'contratista_email', label: 'Correo del contratista', origen: 'perfil_profesional', alimenta: 'contrato',
    todo: 'TODO (PARTES): mismo caso que [4] -- el pro ya dio su email al registrarse pero no está expuesto vía profiles/professionals para que el cliente (u otro contexto) lo lea. Exponerlo en vez de pedirlo de nuevo.'
  }),
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
    fuente: { tabla: 'professional_verification', columnas: ['matricula_entidad', 'matricula_numero', 'matricula_vencimiento', 'matricula_adjunto_path'] }
  },

  // ── 1. OBJETO — [12]-[15] ───────────────────────────────────────────
  {
    id: 12, estado: 'definido', clave: 'obra_direccion_inmueble',
    label: 'Dirección del inmueble', origen: 'obra',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'requests', columnas: ['direccion'] }
  },
  {
    id: 13, estado: 'definido', clave: 'obra_tipo_rubro',
    label: 'Tipo/rubro del trabajo', origen: 'obra',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'requests', columnas: ['rubros', 'tipo_construccion'] }
  },
  {
    id: 14, estado: 'definido', clave: 'obra_alcance',
    label: 'Alcance contratado', origen: 'obra',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'requests', columnas: ['descripcion'] }
  },
  stubField(15, 'pendiente', {
    origen: 'obra', alimenta: 'contrato',
    todo: 'TODO (OBJETO): exclusiones del alcance contratado. No existe ningún campo de "exclusiones" en requests/quotes hoy.'
  }),

  // ── 2. PRECIO Y FORMA DE PAGO — [16]-[19] ───────────────────────────
  {
    id: 16, estado: 'definido', clave: 'obra_precio_total',
    label: 'Precio total', origen: 'obra',
    tipo: 'number', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'quotes', columnas: ['amount'], filtro: "status = 'accepted'" }
  },
  {
    id: 17, estado: 'definido', clave: 'obra_moneda',
    label: 'Moneda', origen: 'obra',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { constante: 'ARS' }
  },
  stubField(18, 'pendiente', {
    origen: 'obra', alimenta: 'contrato',
    todo: 'TODO (PRECIO): tratamiento de impuestos. No se recolecta en ninguna pantalla hoy.'
  }),
  stubField(19, 'pendiente', {
    origen: 'obra', alimenta: 'contrato',
    todo: 'TODO (PRECIO): anticipo / forma inicial de pago. Los hitos definen pagos escalonados pero no hay un concepto explícito de "anticipo" separado del primer hito.'
  }),

  // ── 3. PLAZO — [20]-[21] ────────────────────────────────────────────
  stubField(20, 'pendiente', {
    origen: 'obra', alimenta: 'contrato',
    todo: 'TODO (PLAZO): fecha estimada de inicio de la obra. No confundir con la fecha_estimada de cada hito -- no hay un campo obra-level para esto en obra_preparacion/requests.'
  }),
  stubField(21, 'pendiente', {
    origen: 'obra', alimenta: 'contrato',
    todo: 'TODO (PLAZO): fecha estimada de finalización de la obra. Mismo caso que [20] -- no derivar del máximo de fecha_estimada de los hitos sin confirmar que sea correcto.'
  }),

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
    fuente: { tabla: 'hito_participantes', columnas: ['nombre', 'especialidad', 'modalidad'] }
  },
  {
    id: 30, estado: 'definido', clave: 'participantes_documentacion',
    label: 'Documentación exigible por modalidad', origen: 'participantes',
    tipo: 'text', requerido: false, alimenta: 'anexo_equipo', lista: true,
    fuente: { tabla: 'hito_participantes', columnas: ['documentacion_nota'] }
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
