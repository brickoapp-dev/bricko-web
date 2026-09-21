/* contract-pdf.js — Genera un PDF real del contrato en el navegador
   (sin backend nuevo), reemplazando las 3 implementaciones duplicadas
   de window.open()+win.print() que había en carpeta.js, client-solicitud.js
   y pro-preobra.js. Usa html2canvas (rasteriza el mismo HTML de
   renderContratoHTML(), así el PDF es visualmente idéntico a la vista
   en pantalla) + jsPDF (arma el PDF paginado a partir de esa imagen).
   Requiere que la página haya cargado ambas libs por <script> (cdnjs)
   antes de este archivo. */

async function descargarContratoPDF(payload, meta, templateId, filename) {
  if (!window.html2canvas || !window.jspdf) {
    console.error('contract-pdf.js: faltan html2canvas/jsPDF -- revisar los <script> de la página.');
    return false;
  }

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = '860px';
  container.style.background = '#fff';
  container.innerHTML = window.renderContratoHTML(payload, meta, templateId);
  document.body.appendChild(container);

  try {
    // Deja que el navegador aplique el layout/CSS insertado antes de medir/rasterizar.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    // Corta el documento en hojas .contrato-page (sin partir filas/párrafos
    // a mitad de hoja) -- ver paginateContratoDoc() en contract-render.js.
    window.paginateContratoDoc(container);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const pages = container.querySelectorAll('.contrato-page');
    for (let i = 0; i < pages.length; i++) {
      const canvas = await window.html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
    }

    pdf.save(filename || 'contrato.pdf');
    return true;
  } finally {
    document.body.removeChild(container);
  }
}

window.descargarContratoPDF = descargarContratoPDF;
