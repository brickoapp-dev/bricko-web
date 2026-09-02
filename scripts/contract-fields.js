/* contract-fields.js — Diccionario único de los campos [1]-[31] del PDF
   de contrato. Cada campo se carga una sola vez en su pantalla de origen
   (perfil del cliente, perfil del profesional, plan por hitos o
   participantes) y el generador de contrato solo lee de ahí -- nunca
   vuelve a pedirlo en un form propio. Si falta un campo obligatorio, el
   generador debe mostrar qué falta y linkear a BRICKO_ORIGEN_SCREENS[origen],
   no abrir un formulario nuevo.

   [12]-[21] y [28] todavía no tienen pantalla ni tabla de origen definida
   (ver §9 del PDF) -- quedan declarados como stub con estado:'pendiente'
   y un TODO, sin inventar de qué dato se trata. */

window.BRICKO_ORIGEN_SCREENS = {
  perfil_cliente: () => 'client-perfil.html',
  perfil_profesional: () => 'properfil.html',
  plan_hitos: (obraId) => `pro-preobra.html?req=${obraId}&gate=4`,
  participantes: (obraId) => `pro-preobra.html?req=${obraId}&gate=5`,
  obra: (obraId) => `pro-preobra.html?req=${obraId}`
};

function pendienteField(id, alimenta = null) {
  return {
    id,
    estado: 'pendiente',
    clave: null,
    label: null,
    origen: null,
    tipo: null,
    requerido: null,
    alimenta,
    lista: null,
    fuente: null,
    todo: `TODO: definir a qué dato del PDF corresponde el campo [${id}] (ver §9). No inventar contenido hasta confirmar contra el documento fuente.`
  };
}

window.BRICKO_FIELDS = [
  // [1]-[5] — perfil del cliente (public.profiles)
  {
    id: 1, estado: 'definido', clave: 'cliente_nombre_completo',
    label: 'Nombre y apellido del cliente', origen: 'perfil_cliente',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['first_name', 'last_name'] }
  },
  {
    id: 2, estado: 'definido', clave: 'cliente_telefono',
    label: 'Teléfono del cliente', origen: 'perfil_cliente',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['phone'] }
  },
  {
    id: 3, estado: 'definido', clave: 'cliente_domicilio',
    label: 'Domicilio del cliente', origen: 'perfil_cliente',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['address'] }
  },
  {
    id: 4, estado: 'definido', clave: 'cliente_localidad',
    label: 'Localidad del cliente', origen: 'perfil_cliente',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['city'] }
  },
  {
    id: 5, estado: 'definido', clave: 'cliente_provincia',
    label: 'Provincia del cliente', origen: 'perfil_cliente',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['province'] }
  },

  // [6]-[11] — perfil del profesional/contratista (public.profiles +
  // public.professionals + public.professional_verification)
  {
    id: 6, estado: 'definido', clave: 'contratista_nombre_completo',
    label: 'Nombre y apellido del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['first_name', 'last_name'] }
  },
  {
    id: 7, estado: 'definido', clave: 'contratista_dni',
    label: 'DNI del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'professional_verification', columnas: ['dni_number'] }
  },
  {
    id: 8, estado: 'definido', clave: 'contratista_domicilio',
    label: 'Domicilio del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'professional_verification', columnas: ['direccion'] }
  },
  {
    id: 9, estado: 'definido', clave: 'contratista_rubro',
    label: 'Rubro / oficio del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'professionals', columnas: ['rubro', 'rubros'] }
  },
  {
    id: 10, estado: 'definido', clave: 'contratista_telefono',
    label: 'Teléfono del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'profiles', columnas: ['phone'] }
  },
  {
    id: 11, estado: 'definido', clave: 'contratista_localidad',
    label: 'Localidad del contratista', origen: 'perfil_profesional',
    tipo: 'text', requerido: true, alimenta: 'contrato', lista: false,
    fuente: { tabla: 'professionals', columnas: ['localidad', 'residencia'] }
  },

  // [12]-[21] — pendientes de definición (ver §9)
  ...Array.from({ length: 10 }, (_, i) => pendienteField(12 + i)),

  // [22]-[26] — plan por hitos, un valor por hito (public.hitos)
  {
    id: 22, estado: 'definido', clave: 'hito_numero',
    label: 'Número de hito', origen: 'plan_hitos',
    tipo: 'number', requerido: true, alimenta: 'anexo_hitos', lista: true,
    fuente: { tabla: 'hitos', columnas: ['numero'] }
  },
  {
    id: 23, estado: 'definido', clave: 'hito_titulo',
    label: 'Título del hito', origen: 'plan_hitos',
    tipo: 'text', requerido: true, alimenta: 'anexo_hitos', lista: true,
    fuente: { tabla: 'hitos', columnas: ['titulo'] }
  },
  {
    id: 24, estado: 'definido', clave: 'hito_descripcion',
    label: 'Resultado esperado del hito', origen: 'plan_hitos',
    tipo: 'text', requerido: false, alimenta: 'anexo_hitos', lista: true,
    fuente: { tabla: 'hitos', columnas: ['descripcion'] }
  },
  {
    id: 25, estado: 'definido', clave: 'hito_monto',
    label: 'Monto del hito', origen: 'plan_hitos',
    tipo: 'number', requerido: true, alimenta: 'anexo_hitos', lista: true,
    fuente: { tabla: 'hitos', columnas: ['monto'] }
  },
  {
    id: 26, estado: 'definido', clave: 'hito_fecha_estimada',
    label: 'Fecha estimada del hito', origen: 'plan_hitos',
    tipo: 'date', requerido: true, alimenta: 'anexo_hitos', lista: true,
    fuente: { tabla: 'hitos', columnas: ['fecha_estimada'] }
  },
  // [27] — total, derivado de la suma de los hitos
  {
    id: 27, estado: 'definido', clave: 'monto_total_hitos',
    label: 'Monto total de la obra (suma de hitos)', origen: 'plan_hitos',
    tipo: 'number', requerido: false, alimenta: 'anexo_hitos', lista: false,
    fuente: { tabla: 'hitos', columnas: ['monto'], agregacion: 'sum' }
  },

  // [28] — anexo materiales: pendiente de definición (mismo criterio que
  // [12]-[21]). Hoy no existe ninguna tabla ni pantalla de materiales.
  pendienteField(28, 'anexo_materiales'),

  // [29]-[30] — participantes y documentación (public.hito_participantes)
  {
    id: 29, estado: 'definido', clave: 'participantes_listado',
    label: 'Responsables por hito (nombre y modalidad)', origen: 'participantes',
    tipo: 'text', requerido: true, alimenta: 'anexo_equipo', lista: true,
    fuente: { tabla: 'hito_participantes', columnas: ['nombre', 'modalidad'] }
  },
  {
    id: 30, estado: 'definido', clave: 'participantes_documentacion',
    label: 'Documentación / nota declarada por participante', origen: 'participantes',
    tipo: 'text', requerido: false, alimenta: 'anexo_equipo', lista: true,
    fuente: { tabla: 'hito_participantes', columnas: ['documentacion_nota'] }
  },

  // [31] — total, derivado de la cantidad de hitos
  {
    id: 31, estado: 'definido', clave: 'cantidad_hitos',
    label: 'Cantidad total de hitos', origen: 'plan_hitos',
    tipo: 'number', requerido: false, alimenta: 'anexo_hitos', lista: false,
    fuente: { tabla: 'hitos', columnas: ['numero'], agregacion: 'count' }
  }
];
