/* contract-pdf.js — Genera un PDF real del contrato en el navegador
   (sin backend nuevo), reemplazando las 3 implementaciones duplicadas
   de window.open()+win.print() que había en carpeta.js, client-solicitud.js
   y pro-preobra.js. Usa html2canvas (rasteriza el mismo HTML de
   renderContratoHTML(), así el PDF es visualmente idéntico a la vista
   en pantalla) + jsPDF (arma el PDF paginado a partir de esa imagen).
   html2canvas + jsPDF pesan ~550 KB juntos y antes se cargaban con dos
   <script> de cdnjs en CADA carga de mis-obras / pro-cotizar / pro-preobra /
   client-solicitud, aunque el usuario no bajara ningún PDF: eran dos
   descargas bloqueantes contra un tercero más el parseo/ejecución del
   bundle, en pantallas que ya venían lentas. Ahora se cargan la primera vez
   que se pide un PDF y quedan cacheadas para el resto de la sesión. */

const PDF_LIBS = [
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', ready: () => !!window.html2canvas },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',         ready: () => !!window.jspdf }
];

let pdfLibsPromise = null;

function loadScriptOnce(url) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-lazy-src="${url}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') { resolve(); return; }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar ' + url)), { once: true });
      return;
    }
    const el = document.createElement('script');
    el.src = url;
    el.async = true;
    el.dataset.lazySrc = url;
    el.addEventListener('load', () => { el.dataset.loaded = '1'; resolve(); }, { once: true });
    el.addEventListener('error', () => reject(new Error('No se pudo cargar ' + url)), { once: true });
    document.head.appendChild(el);
  });
}

function ensurePdfLibs() {
  if (PDF_LIBS.every(l => l.ready())) return Promise.resolve();
  if (!pdfLibsPromise) {
    pdfLibsPromise = Promise.all(PDF_LIBS.map(l => (l.ready() ? Promise.resolve() : loadScriptOnce(l.url))))
      .catch((e) => { pdfLibsPromise = null; throw e; });
  }
  return pdfLibsPromise;
}

window.ensurePdfLibs = ensurePdfLibs;

async function descargarContratoPDF(payload, meta, templateId, filename) {
  try {
    await ensurePdfLibs();
  } catch (e) {
    console.error('contract-pdf.js: no se pudieron cargar html2canvas/jsPDF:', e);
    return false;
  }
  if (!window.html2canvas || !window.jspdf) {
    console.error('contract-pdf.js: html2canvas/jsPDF cargaron pero no quedaron expuestos en window.');
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
