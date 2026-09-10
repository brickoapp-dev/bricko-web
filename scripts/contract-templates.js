/* contract-templates.js — Catálogo de plantillas de contrato que el
   profesional elige al cotizar (pro-cotizar.html). Hoy ambas plantillas
   comparten el mismo cuerpo legal (contract-render.js) -- lo único que
   cambia es la frase de apertura de la sección OBJETO, que reconoce si
   se trata de una obra nueva o de una refacción sobre algo existente.
   Cuando exista el documento 01 de la serie con texto legal distinto
   por tipo de obra, se agrega acá sin tocar el resto del render. */

window.BRICKO_CONTRACT_TEMPLATES = [
  {
    id: 'obra-nueva',
    label: 'Obra nueva',
    tipoSugerido: 'obra-nueva',
    aperturaObjeto: 'construir de cero'
  },
  {
    id: 'refaccion',
    label: 'Refacción / trabajo sobre obra existente',
    tipoSugerido: 'refaccion',
    aperturaObjeto: 'refaccionar/intervenir'
  }
];

function sugerirPlantilla(tipoRequest) {
  return window.BRICKO_CONTRACT_TEMPLATES.find(t => t.tipoSugerido === tipoRequest)
    || window.BRICKO_CONTRACT_TEMPLATES[0];
}

window.sugerirPlantillaContrato = sugerirPlantilla;
