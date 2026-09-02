/* legal-versions.js — Única fuente de verdad para la versión vigente de
   Términos y Condiciones / Política de Privacidad. La usan: el registro
   (index.html, para guardar qué versión aceptó cada usuario), las
   propias páginas legales (terminos.html/privacidad.html, para mostrar
   el identificador de versión) y "Legales y privacidad" en los
   perfiles (para mostrar contra qué versión comparar la aceptada).

   Si sube la versión acá, hay que:
   1) actualizar el identificador visible en terminos.html/privacidad.html,
   2) el registro de nuevas cuentas va a guardar la versión nueva solo,
   3) para pedirle re-consentimiento a cuentas existentes falta construir
      el flujo que use needsReconsent() de abajo -- hoy nada lo llama. */

window.BRICKO_LEGAL = {
  terminos: { version: 'v1.0', fecha: '2026-09', pagina: 'terminos.html' },
  privacidad: { version: 'v1.0', fecha: '2026-09', pagina: 'privacidad.html' }
};

/* Previsto para cuando exista el flujo de re-consentimiento (no se
   implementa en T7): compara la versión que el perfil tiene guardada
   contra la vigente. Devuelve qué documentos hay que volver a aceptar. */
function needsReconsent(profile) {
  const pendientes = [];
  if (!profile) return ['terminos', 'privacidad'];
  if (profile.terminos_version !== window.BRICKO_LEGAL.terminos.version) pendientes.push('terminos');
  if (profile.privacidad_version !== window.BRICKO_LEGAL.privacidad.version) pendientes.push('privacidad');
  return pendientes;
}

window.needsReconsent = needsReconsent;
