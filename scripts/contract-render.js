/* contract-render.js — Renderiza el contrato (borrador en vivo o una
   versión congelada) como HTML a partir de un objeto de datos con la
   forma de getContractData()/payload de contrato_versiones. Mismo texto
   que BRICKO_01_Contrato_Tipo_Referencias.pdf, con los campos [1]-[31]
   reemplazados por los valores reales -- los que faltan se marcan en
   vez de inventarse (mismo criterio que validateContractData()). */

function escapeHTML(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function campo(data, clave, label) {
  const v = data ? data[clave] : null;
  const vacio = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
  if (vacio) return `<mark class="cf-falta">falta: ${escapeHTML(label)}</mark>`;
  return `<strong>${escapeHTML(String(v))}</strong>`;
}

function money(n) { return n == null || n === '' ? '' : Number(n).toLocaleString('es-AR'); }

function campoMoney(data, clave, label) {
  const v = data ? data[clave] : null;
  if (v === null || v === undefined || v === '') return `<mark class="cf-falta">falta: ${escapeHTML(label)}</mark>`;
  return `<strong>${money(v)}</strong>`;
}

/* Envuelve el valor renderizado de un campo de texto simple en un span
   editable (ver pro-preobra.js: click abre un input inline sobre esta
   misma vista, sin salir al formulario de origen). `attrs` viene ya
   armado (o null si el campo no es editable en este contexto/estado). */
function campoEditable(data, clave, label, attrs) {
  const inner = campo(data, clave, label);
  if (!attrs) return inner;
  return `<span class="cf-edit" ${attrs}>${inner}</span>`;
}

/* Nota común a las cláusulas resueltas con datos de la oferta (Objeto,
   Precio, Plazo) -- la REDACCIÓN LEGAL definitiva de estas cláusulas
   sigue sujeta al documento 01 de la serie (BRICKO_01_Contrato_Tipo_Referencias.pdf)
   cuando exista; hasta entonces se muestran los datos reales acordados
   entre las partes con esta aclaración, en vez del bloque "PENDIENTE" que
   usaba el contrato antes de tener estos datos. */
const NOTA_REDACCION_LEGAL = '<em style="font-size:12px;color:#7a3e00">(sujeto a redacción legal final)</em>';

/* Tamaño de hoja: A4 real a este ancho de render (760px) -- alto =
   ancho * √2 (proporción exacta de una hoja A4, independiente de la
   escala). paginateContratoDoc() usa esto para cortar por hoja sin
   partir filas/párrafos (ver más abajo); la marca de agua usa la misma
   caja para quedar centrada una vez por hoja. */
const CONTRATO_DOC_WIDTH = 760;
const PAGE_HEIGHT = Math.round(CONTRATO_DOC_WIDTH * Math.SQRT2);
const PAGE_PAD_V = 40;
const PAGE_PAD_H = 48;
const WATERMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${CONTRATO_DOC_WIDTH}" height="${PAGE_HEIGHT}">
  <text x="${CONTRATO_DOC_WIDTH / 2}" y="${PAGE_HEIGHT / 2}" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="430" fill="#1a1a1a" fill-opacity="0.045" text-anchor="middle" dominant-baseline="middle">Ø</text>
</svg>`;
const WATERMARK_DATA_URI = `data:image/svg+xml,${encodeURIComponent(WATERMARK_SVG)}`;

/* Membrete: mismo ícono (cubo isométrico) y wordmark "BRICKØ" que el
   header de index.html (.brand .cube / .iso-top / .iso-left / .iso-right),
   con los colores fijos del tema claro en vez de var(--...) porque esto
   se rasteriza (html2canvas) fuera del documento que define esas variables. */
const CONTRATO_LETTERHEAD = `
  <div class="contrato-letterhead">
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path d="M12 2 L22 7 L12 12 L2 7 Z" fill="#F25C18" />
      <path d="M2 7 L2 17 L12 22 L12 12 Z" fill="#1A1A1A" stroke="#2A2A30" stroke-width="0.6" />
      <path d="M22 7 L22 17 L12 22 L12 12 Z" fill="#2A2A30" stroke="#3A3A42" stroke-width="0.6" />
    </svg>
    <span class="contrato-brand">BRICK<span class="contrato-o">Ø</span></span>
  </div>`;

const CONTRACT_CSS = `
  .contrato-doc, .contrato-page {
    font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; box-sizing: border-box;
    padding: ${PAGE_PAD_V}px ${PAGE_PAD_H}px; width: ${CONTRATO_DOC_WIDTH}px; line-height: 1.65; font-size: 14.5px;
    background-color: #fff;
    background-image: url("${WATERMARK_DATA_URI}");
    background-repeat: no-repeat;
    background-position: center;
  }
  .contrato-doc { margin: 0 auto; }
  .contrato-pages { display: flex; flex-direction: column; align-items: center; gap: 24px; }
  .contrato-page { height: ${PAGE_HEIGHT}px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.15), 0 8px 24px rgba(0,0,0,.12); }
  .contrato-letterhead { display: flex; align-items: center; gap: 9px; margin-bottom: 20px; }
  .contrato-letterhead .contrato-brand { font-family: Arial, Helvetica, sans-serif; font-weight: 800; font-size: 19px; letter-spacing: .03em; text-transform: uppercase; color: #1a1a1a; }
  .contrato-letterhead .contrato-o { color: #F25C18; }
  .contrato-doc h1, .contrato-page h1 { font-size: 20px; text-align: center; margin-bottom: 24px; letter-spacing: .02em; }
  .contrato-doc h2, .contrato-page h2 { font-size: 15px; margin: 26px 0 10px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .contrato-doc p, .contrato-page p { margin: 0 0 12px; text-align: justify; }
  .contrato-doc mark.cf-falta, .contrato-page mark.cf-falta { background: #ffe4b5; color: #7a3e00; padding: 1px 5px; border-radius: 2px; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-style: normal; }
  .contrato-tabla { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 10px 0 16px; font-size: 13px; }
  .contrato-tabla td { overflow-wrap: break-word; }
  .contrato-tabla th, .contrato-tabla td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  .contrato-tabla th { background: #f2f2f2; }
  .contrato-meta { text-align: center; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #666; margin-bottom: 18px; }
  .contrato-doc .cf-edit, .contrato-page .cf-edit { cursor: pointer; border-bottom: 1px dashed #1a66cc; }
  .contrato-doc td.cf-edit, .contrato-page td.cf-edit { cursor: pointer; background: #f6faff; }
  .contrato-doc .cf-edit-hint, .contrato-page .cf-edit-hint { font-size: 11px; color: #1a66cc; font-family: 'JetBrains Mono', monospace; margin: -8px 0 12px; }
  @media print { .contrato-page { box-shadow: none; } }
`;

const MODALIDAD_LABEL_RENDER = { colaborador_independiente: 'Colaborador independiente', profesional: 'Profesional' };

function renderContratoHTML(data, meta, templateId, editCtx) {
  data = data || {};
  editCtx = editCtx || {};
  const plantilla = (window.BRICKO_CONTRACT_TEMPLATES || []).find(t => t.id === templateId);
  const aperturaObjeto = plantilla ? plantilla.aperturaObjeto : 'ejecutar';
  const hitoCount = (data.hito_titulo || []).length;
  const hitosEditable = !!editCtx.editable && !editCtx.hitosLocked;
  const hitoIds = editCtx.hitoIds || [];

  const hitoCelda = (arr, i, hitoId, col, fmt) => {
    const v = arr?.[i];
    const vacio = v === null || v === undefined || v === '';
    const display = vacio ? '<mark class="cf-falta">falta</mark>' : (fmt ? fmt(v) : escapeHTML(String(v)));
    if (hitosEditable && hitoId) {
      return `<td class="cf-edit" data-edit-hito="${hitoId}" data-edit-col="${col}" data-value="${escapeHTML(vacio ? '' : String(v))}">${display}</td>`;
    }
    return `<td>${display}</td>`;
  };
  const hitosRows = hitoCount
    ? Array.from({ length: hitoCount }, (_, i) => {
      const hitoId = hitoIds[i];
      return `
      <tr>
        <td>${i + 1}</td>
        ${hitoCelda(data.hito_titulo, i, hitoId, 'titulo')}
        ${hitoCelda(data.hito_resultado_verificable, i, hitoId, 'descripcion')}
        ${hitoCelda(data.hito_criterio_aceptacion, i, hitoId, 'criterio_aceptacion')}
        ${hitoCelda(data.hito_monto, i, hitoId, 'monto', (v) => `$ ${money(v)}`)}
        ${hitoCelda(data.hito_fecha_objetivo, i, hitoId, 'fecha_estimada')}
        ${hitoCelda(data.hito_responsable, i, hitoId, 'responsable_nombre')}
        ${hitoCelda(data.plazo_observacion_dias, i, hitoId, 'plazo_observacion_dias', (v) => `${v} días`)}
      </tr>`;
    }).join('')
    : `<tr><td colspan="8"><mark class="cf-falta">falta: plan por hitos [22]-[27],[31]</mark></td></tr>`;
  const hitosLockedHint = editCtx.editable && editCtx.hitosLocked
    ? `<p class="cf-edit-hint">Plan por hitos confirmado -- para editarlo, reabrilo en la pestaña "Plan por hitos".</p>` : '';

  const participantes = data.participantes_listado || [];
  const participanteIds = editCtx.participanteIds || [];
  const participantesEditable = !!editCtx.editable;
  const participanteCelda = (val, participanteId, col, display) => {
    if (participantesEditable && participanteId) {
      return `<td class="cf-edit" data-edit-participante="${participanteId}" data-edit-col="${col}" data-value="${escapeHTML(val || '')}">${display ?? escapeHTML(val || '')}</td>`;
    }
    return `<td>${display ?? escapeHTML(val || '')}</td>`;
  };
  const participantesRows = participantes.length
    ? participantes.map((p, i) => {
      const pid = participanteIds[i];
      return `
      <tr>
        ${participanteCelda(p.nombre, pid, 'nombre')}
        ${participanteCelda(p.especialidad, pid, 'especialidad')}
        ${participanteCelda(p.modalidad, pid, 'modalidad', escapeHTML(MODALIDAD_LABEL_RENDER[p.modalidad] || p.modalidad || ''))}
      </tr>`;
    }).join('')
    : `<tr><td colspan="3"><mark class="cf-falta">falta: equipo de la obra [29]</mark></td></tr>`;

  const documentacion = (data.participantes_documentacion || []).join('; ');

  return `
    <style>${CONTRACT_CSS}</style>
    <article class="contrato-doc">
      ${CONTRATO_LETTERHEAD}
      ${meta ? `<div class="contrato-meta">${escapeHTML(meta)}</div>` : ''}
      <h1>CONTRATO TIPO DE OBRA — BRICKØ</h1>

      <h2>PARTES</h2>
      <p>Entre ${campo(data, 'cliente_nombre_completo', '[1] Nombre/razón social del comitente')},
      DNI/CUIT ${campo(data, 'cliente_dni_cuit', '[2] DNI/CUIT del comitente')},
      con domicilio contractual en ${campo(data, 'cliente_domicilio', '[3] Domicilio del comitente')}
      y correo ${campo(data, 'cliente_email', '[4] Correo del comitente')},
      quien declara actuar respecto del inmueble en carácter de ${campo(data, 'caracter_inmueble', '[5] Carácter respecto del inmueble')},
      en adelante el "COMITENTE";</p>

      <p>y ${campo(data, 'contratista_nombre_completo', '[6] Nombre/razón social del contratista')},
      DNI/CUIT ${campo(data, 'contratista_dni_cuit', '[7] DNI/CUIT del contratista')},
      con domicilio contractual en ${campoEditable(data, 'contratista_domicilio', '[8] Domicilio del contratista', editCtx.editable ? `data-edit-field="contratista_domicilio" data-value="${escapeHTML(data.contratista_domicilio || '')}"` : null)},
      correo ${campo(data, 'contratista_email', '[9] Correo del contratista')},
      condición fiscal ${campo(data, 'contratista_condicion_fiscal', '[10] Condición fiscal del contratista')}
      y matrícula/registro ${campoEditable(data, 'contratista_matricula', '[11] Matrícula del contratista', editCtx.editable ? `data-edit-field="contratista_matricula" data-entidad="${escapeHTML(editCtx.matricula?.entidad || '')}" data-numero="${escapeHTML(editCtx.matricula?.numero || '')}" data-vencimiento="${escapeHTML(editCtx.matricula?.vencimiento || '')}"` : null)} cuando corresponda,
      en adelante el "CONTRATISTA", se celebra el presente contrato de obra.</p>

      <h2>1. OBJETO</h2>
      <p>El CONTRATISTA se obliga a ${escapeHTML(aperturaObjeto)} el trabajo de ${campo(data, 'objeto_rubro', '[13] Tipo/rubro del trabajo')}
      en el inmueble ubicado en ${campo(data, 'objeto_direccion', '[12] Dirección del inmueble')},
      con el siguiente alcance: ${campo(data, 'objeto_alcance', '[14] Alcance contratado')}. ${NOTA_REDACCION_LEGAL}</p>
      <p><mark class="cf-falta">PENDIENTE [15]: exclusiones del alcance contratado -- no existe todavía ningún campo para cargarlas.</mark></p>

      <h2>2. PRECIO Y FORMA DE PAGO</h2>
      <p>El precio total de la obra es de $ ${campoMoney(data, 'precio_total', '[16] Precio total')}. ${NOTA_REDACCION_LEGAL}</p>
      <p><mark class="cf-falta">PENDIENTE [17]-[19]: moneda, tratamiento de impuestos y anticipo -- falta el documento 01 de la serie (cuerpo del contrato marco).</mark></p>

      <h2>3. PLAZO</h2>
      <p>Plazo estimado de ejecución: ${campo(data, 'plazo_estimado', '[20]-[21] Plazo estimado de ejecución')}, a contar desde el inicio efectivo de la obra
      (fecha de inicio y de finalización exactas a coordinar entre las partes al habilitarse la obra). ${NOTA_REDACCION_LEGAL}</p>

      <h2>4. HITOS Y ENTREGABLES</h2>
      ${hitosLockedHint}
      <table class="contrato-tabla">
        <colgroup>
          <col style="width:4%"><col style="width:14%"><col style="width:19%">
          <col style="width:17%"><col style="width:9%"><col style="width:10%">
          <col style="width:14%"><col style="width:13%">
        </colgroup>
        <thead><tr>
          <th>#</th><th>Título [22]</th><th>Resultado verificable [23]</th>
          <th>Criterio de aceptación [26]</th><th>Monto [24]</th><th>Fecha objetivo [25]</th>
          <th>Responsable [27]</th><th>Plazo de observación [31]</th>
        </tr></thead>
        <tbody>${hitosRows}</tbody>
      </table>
      <p>El COMITENTE aprobará u observará cada hito dentro del plazo de observación indicado en la tabla.
      La observación debe identificar el incumplimiento concreto respecto del resultado o criterio acordado.</p>

      <h2>5. MATERIALES</h2>
      <p>Los materiales incluidos, excluidos y la parte responsable de comprarlos/proveerlos constan en:
      ${campo(data, 'materiales', '[28] Materiales incluidos/excluidos')}.
      Una sustitución que cambie calidad, precio o resultado requiere aceptación trazable.</p>

      <h2>6. EQUIPO Y MODALIDAD DE PARTICIPACIÓN</h2>
      <table class="contrato-tabla">
        <colgroup><col style="width:38%"><col style="width:34%"><col style="width:28%"></colgroup>
        <thead><tr><th>Nombre [29]</th><th>Función/tarea</th><th>Modalidad</th></tr></thead>
        <tbody>${participantesRows}</tbody>
      </table>
      <p>Documentación exigible por modalidad [30]: ${documentacion ? escapeHTML(documentacion) : '<mark class="cf-falta">falta: documentación por modalidad [30]</mark>'}.
      PADIC se utiliza únicamente cuando corresponda al régimen real aplicable. No reemplaza registraciones laborales, contratos profesionales, matrículas, seguros ni otra documentación exigible.</p>

      <h2>7. DOCUMENTACIÓN Y HABILITACIÓN</h2>
      <p>Antes del inicio deberán estar completos el contrato, los hitos, el equipo y la documentación aplicable. La habilitación dentro de BRICKØ es una condición de sistema y no reemplaza permisos, inspecciones ni autorizaciones administrativas.</p>

      <h2>8. CAMBIOS</h2>
      <p>Todo cambio de alcance, precio, materiales, hitos o plazo debe generar una orden de cambio. La nueva versión debe mostrar qué cambió y conservar la versión anterior. Ninguna modificación informal debe sobrescribir silenciosamente el contrato vigente.</p>

      <h2>9. OBLIGACIONES DEL CONTRATISTA</h2>
      <p>El CONTRATISTA ejecutará la obra conforme al alcance, las reglas del arte y la normativa aplicable; organizará sus medios y participantes; mantendrá la documentación exigible; informará desvíos relevantes; y responderá por la ejecución en los términos legales y contractuales aplicables.</p>

      <h2>10. OBLIGACIONES DEL COMITENTE</h2>
      <p>El COMITENTE facilitará acceso e información, abonará lo pactado, entregará los materiales a su cargo, aprobará u observará hitos y cumplirá las obligaciones que expresamente le correspondan.</p>

      <h2>11. RECEPCIÓN, DEFECTOS Y GARANTÍAS</h2>
      <p>La recepción provisoria y definitiva, las observaciones y los pendientes quedarán documentados. Ninguna aceptación digital elimina derechos u obligaciones que sean inderogables por ley.</p>

      <h2>12. ROL DE BRICKØ</h2>
      <p>BRICKØ facilita vinculación, documentación, trazabilidad, carpeta digital y herramientas de gestión. Salvo servicio expreso y separado, BRICKØ no es comitente, contratista, empleador, director de obra ni garante del resultado material.</p>

      <h2>13. CARPETA DIGITAL Y EVIDENCIA</h2>
      <p>El sistema conservará el contrato final, anexos, versiones, aceptaciones, hitos, participantes, documentación, órdenes de cambio y registros necesarios. El documento final debe ser el mismo para ambas partes y quedar identificado por versión, fecha e integridad (hash).</p>

      <h2>14. FIRMA / ACEPTACIÓN</h2>
      <p>Cada parte revisará la misma versión del contrato y sus anexos. Si se modifica cualquier dato contractual, las aprobaciones anteriores dejan de valer. El sistema conserva evidencia del método de aceptación utilizado (aceptación en la app, con usuario, rol, fecha/hora UTC, versión y hash).</p>

      <h2>15. RESOLUCIÓN Y CONTROVERSIAS</h2>
      <p>Ante incumplimiento esencial, se aplicarán las intimaciones, efectos y mecanismos previstos por la normativa y por el texto legal definitivo. La ley y jurisdicción deberán cerrarse con asesoría jurídica antes de producción.</p>
    </article>
  `;
}

window.renderContratoHTML = renderContratoHTML;

/* paginateContratoDoc(hostEl) -- corta el .contrato-doc (ya insertado
   y con layout aplicado dentro de hostEl, vía innerHTML = renderContratoHTML())
   en hojas .contrato-page de alto fijo (PAGE_HEIGHT), sin partir filas
   de tabla ni párrafos a mitad de hoja. Reemplaza el corte por pixel
   ciego que usaba contract-pdf.js. Debe llamarse después de esperar el
   layout (mismo patrón de doble requestAnimationFrame que ya usa
   contract-pdf.js), porque mide con getBoundingClientRect() -- no
   funciona sobre el string de renderContratoHTML() todavía sin insertar. */
function paginateContratoDoc(hostEl) {
  const docEl = hostEl.querySelector('.contrato-doc');
  if (!docEl) return;

  // El margen de 12px absorbe el redondeo sub-píxel que se va acumulando
  // al sumar muchas alturas medidas (Math.round de PAGE_HEIGHT, bordes de
  // tabla, etc.) -- sin esto una hoja puede terminar un puñado de píxeles
  // más alta de lo que entra en .contrato-page (overflow:hidden la recorta).
  const usableHeight = PAGE_HEIGHT - PAGE_PAD_V * 2 - 12;
  const pagesWrap = document.createElement('div');
  pagesWrap.className = 'contrato-pages';

  let currentPage = document.createElement('div');
  currentPage.className = 'contrato-page';
  pagesWrap.appendChild(currentPage);
  let used = 0;

  const newPage = () => {
    currentPage = document.createElement('div');
    currentPage.className = 'contrato-page';
    pagesWrap.appendChild(currentPage);
    used = 0;
  };

  // getBoundingClientRect().height NO incluye el margin del elemento --
  // un <h2>/<p> con margin-bottom ocuparía más lugar en el flujo real del
  // que reporta su propia altura. footprintHeight() lo resuelve sumando
  // el margin-bottom calculado (no sirve para <table>, que se mide aparte
  // en placeTable() porque su "unidad atómica" real es cada <tr>).
  const footprintHeight = (el) => {
    const mb = parseFloat(getComputedStyle(el).marginBottom) || 0;
    return el.getBoundingClientRect().height + mb;
  };

  const estimateFirstChunk = (el) => {
    if (el.tagName === 'TABLE') {
      const thead = el.querySelector('thead');
      const firstRow = el.querySelector('tbody tr');
      const marginTop = parseFloat(getComputedStyle(el).marginTop) || 0;
      return marginTop + (thead ? thead.getBoundingClientRect().height : 0) + (firstRow ? firstRow.getBoundingClientRect().height : 0);
    }
    return footprintHeight(el);
  };

  const placeTable = (table) => {
    const colgroupOriginal = table.querySelector('colgroup');
    const theadOriginal = table.querySelector('thead');
    const theadH = theadOriginal ? theadOriginal.getBoundingClientRect().height : 0;
    const marginTop = parseFloat(getComputedStyle(table).marginTop) || 0;
    const rows = Array.from(table.querySelectorAll('tbody tr'));

    // El espacio ANTES de la tabla (colapsado con el margin-bottom del
    // hermano anterior) ya lo sumó el hermano anterior en el loop de abajo
    // (mide hasta el top real de esta tabla). marginTop solo hace falta
    // acá cuando la tabla arranca sola en una hoja nueva (used === 0):
    // ahí no hay hermano anterior en esta hoja que ya lo haya contado, y
    // el padding de la hoja bloquea el colapso de margin con el padre.
    const startTableOnCurrentPage = () => {
      const tbody = document.createElement('tbody');
      const t = document.createElement('table');
      t.className = table.className;
      if (colgroupOriginal) t.appendChild(colgroupOriginal.cloneNode(true));
      if (theadOriginal) t.appendChild(theadOriginal.cloneNode(true));
      t.appendChild(tbody);
      currentPage.appendChild(t);
      if (used === 0) used += marginTop;
      used += theadH;
      return tbody;
    };

    // No dejar el encabezado solo al pie de la hoja si ni la primera fila entra con él.
    if (used > 0 && used + theadH + (rows[0]?.getBoundingClientRect().height || 0) > usableHeight) {
      newPage();
    }
    let tbody = startTableOnCurrentPage();

    rows.forEach((row) => {
      const h = row.getBoundingClientRect().height;
      if (tbody.children.length > 0 && used + h > usableHeight) {
        newPage();
        tbody = startTableOnCurrentPage();
      }
      tbody.appendChild(row.cloneNode(true));
      used += h;
    });
    // El margin-bottom de la tabla (y su posible colapso con lo que sigue)
    // lo cuenta el próximo hermano en el loop de abajo -- acá no hace
    // falta sumar nada más.
  };

  const children = Array.from(docEl.children);
  // getBoundingClientRect().height NO incluye el margin de un elemento, y
  // sumar el margin-bottom "a mano" tampoco alcanza porque los márgenes
  // verticales entre hermanos COLAPSAN (el hueco real es el máximo entre
  // ambos, no la suma) -- por ej. un <p> (margin-bottom:12) seguido de un
  // <h2> (margin-top:26) deja un hueco real de 26px, no 12. La distancia
  // real entre el `top` de un hermano y el del siguiente ya refleja ese
  // colapso tal cual el navegador lo resolvió, sin tener que reproducir
  // las reglas de colapso a mano.
  const tops = children.map(c => c.getBoundingClientRect().top);

  children.forEach((child, i) => {
    if (child.tagName === 'TABLE') {
      placeTable(child);
      return;
    }

    const h = i + 1 < children.length ? tops[i + 1] - tops[i] : footprintHeight(child);

    // Título huérfano: si el h2 y el arranque de lo que sigue no entran
    // juntos en lo que queda de la hoja, el salto va ANTES del h2.
    if (child.tagName === 'H2' && i + 1 < children.length) {
      const nextChunk = estimateFirstChunk(children[i + 1]);
      if (used > 0 && used + h + nextChunk > usableHeight && h + nextChunk <= usableHeight) {
        newPage();
      }
    }

    if (used > 0 && used + h > usableHeight) {
      newPage();
    }
    // Si el elemento termina siendo el primero de una hoja (nueva o la
    // inicial), su propio margin-top pasa a ser espacio real: el padding
    // de .contrato-page bloquea el colapso con lo anterior que sí ocurría
    // en el documento original (mismo motivo que el `if (used === 0)` de
    // placeTable() más arriba).
    if (used === 0) {
      used += parseFloat(getComputedStyle(child).marginTop) || 0;
    }
    currentPage.appendChild(child.cloneNode(true));
    used += h;
  });

  docEl.replaceWith(pagesWrap);
}

window.paginateContratoDoc = paginateContratoDoc;
