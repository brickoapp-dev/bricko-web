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
    fuente: { tabla: 'profiles', columnas: ['first_name', 'last_name'] }
  },
  stubField(2, 'pendiente', {
    origen: 'perfil_cliente', alimenta: 'contrato',
    todo: 'TODO (PARTES): DNI/CUIT del comitente. client-perfil.html no pide DNI/CUIT hoy -- no existe columna en profiles. Definir si va en profiles o en una tabla de verificación propia del cliente (como professional_verification para el pro) antes de agregar la pantalla.'
  }),
  {
    id: 3, estado: 'definido', clave: 'cliente_domicilio',
    label: 'Domicilio contractual del comitente', origen: 'perfil_cliente',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['address'] }
  },
  stubField(4, 'existe_no_expuesto', {
    clave: 'cliente_email', label: 'Correo del comitente', origen: 'perfil_cliente', alimenta: 'contrato',
    todo: 'TODO (PARTES): el cliente ya dio su email al registrarse (auth.users.email), pero profiles no lo guarda y un profesional no puede leer auth.users de otro usuario por RLS. Exponerlo (ej. columna profiles.email poblada por handle_new_user + backfill) en vez de pedirlo de nuevo.'
  }),
  stubField(5, 'pendiente', {
    origen: 'obra', alimenta: 'contrato',
    todo: 'TODO (PARTES): carácter en que el comitente actúa respecto del inmueble (propietario, apoderado, etc.). No se recolecta en ninguna pantalla hoy -- es del inmueble/obra puntual, no del perfil general del cliente (puede cambiar entre solicitudes).'
  }),

  // ── PARTES: CONTRATISTA (profesional) — [6]-[11] ───────────────────
  {
    id: 6, estado: 'definido', clave: 'contratista_nombre_completo',
    label: 'Nombre / razón social del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['first_name', 'last_name'] }
  },
  {
    id: 7, estado: 'definido', clave: 'contratista_dni_cuit',
    label: 'DNI/CUIT del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'professional_verification', columnas: ['dni_number'] }
  },
  {
    id: 8, estado: 'definido', clave: 'contratista_domicilio',
    label: 'Domicilio contractual del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'professional_verification', columnas: ['direccion'] }
  },
  stubField(9, 'existe_no_expuesto', {
    clave: 'contratista_email', label: 'Correo del contratista', origen: 'perfil_profesional', alimenta: 'contrato',
    todo: 'TODO (PARTES): mismo caso que [4] -- el pro ya dio su email al registrarse pero no está expuesto vía profiles/professionals para que el cliente (u otro contexto) lo lea. Exponerlo en vez de pedirlo de nuevo.'
  }),
  stubField(10, 'pendiente', {
    origen: 'perfil_profesional', alimenta: 'contrato',
    todo: 'TODO (PARTES): condición fiscal del contratista (monotributista, responsable inscripto, etc.). No existe columna en professionals/professional_verification. Probablemente properfil.html.'
  }),
  stubField(11, 'pendiente', {
    origen: 'perfil_profesional', alimenta: 'contrato',
    todo: 'TODO (PARTES): matrícula/registro del contratista "cuando corresponda". No existe columna hoy -- ver si aplica a todos los rubros o solo a algunos antes de agregar el campo.'
  }),

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
  stubField(26, 'pendiente', {
    origen: 'plan_hitos', alimenta: 'anexo_hitos',
    todo: 'TODO (HITOS): criterio de aceptación del hito. hitos.descripcion cubre el "resultado verificable" [23] pero no hay un campo separado de "criterio de aceptación" -- ver si son el mismo dato o hace falta una columna nueva (hitos.criterio_aceptacion).'
  }),
  {
    id: 27, estado: 'definido', clave: 'hito_responsable',
    label: 'Responsable del hito', origen: 'participantes',
    tipo: 'text', requerido: false, alimenta: 'anexo_hitos', lista: true,
    fuente: { tabla: 'hito_participantes', columnas: ['nombre'], filtro: 'agrupado por hito_id' }
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

  // ── 4. HITOS Y ENTREGABLES (cont.) — [31] ───────────────────────────
  stubField(31, 'pendiente', {
    origen: 'obra', alimenta: 'anexo_hitos',
    todo: 'TODO (HITOS): plazo en que el comitente debe aprobar u observar cada hito (ej. "5 días hábiles"). No existe ningún campo de este tipo en obra_preparacion -- es una configuración a nivel obra, no por hito.'
  })
];
