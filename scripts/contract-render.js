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

const CONTRACT_CSS = `
  .contrato-doc { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; background: #fff; padding: 40px 48px; max-width: 760px; margin: 0 auto; line-height: 1.65; font-size: 14.5px; }
  .contrato-doc h1 { font-size: 20px; text-align: center; margin-bottom: 24px; letter-spacing: .02em; }
  .contrato-doc h2 { font-size: 15px; margin: 26px 0 10px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .contrato-doc p { margin: 0 0 12px; text-align: justify; }
  .contrato-doc mark.cf-falta { background: #ffe4b5; color: #7a3e00; padding: 1px 5px; border-radius: 2px; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-style: normal; }
  .contrato-tabla { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 13px; }
  .contrato-tabla th, .contrato-tabla td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  .contrato-tabla th { background: #f2f2f2; }
  .contrato-meta { text-align: center; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #666; margin-bottom: 18px; }
  @media print { .contrato-doc { padding: 0; } }
`;

function renderContratoHTML(data, meta) {
  data = data || {};
  const hitoCount = (data.hito_titulo || []).length;
  const hitosRows = hitoCount
    ? Array.from({ length: hitoCount }, (_, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHTML(data.hito_titulo?.[i] || '')}</td>
        <td>${escapeHTML(data.hito_resultado_verificable?.[i] || '')}</td>
        <td>$ ${money(data.hito_monto?.[i])}</td>
        <td>${escapeHTML(data.hito_fecha_objetivo?.[i] || '')}</td>
        <td>${escapeHTML(data.hito_responsable?.[i] || '')}</td>
      </tr>`).join('')
    : `<tr><td colspan="6"><mark class="cf-falta">falta: plan por hitos [22]-[25],[27]</mark></td></tr>`;

  const participantes = data.participantes_listado || [];
  const participantesRows = participantes.length
    ? participantes.map(p => `
      <tr>
        <td>${escapeHTML(p.nombre || '')}</td>
        <td>${escapeHTML(p.especialidad || '')}</td>
        <td>${escapeHTML(p.modalidad || '')}</td>
      </tr>`).join('')
    : `<tr><td colspan="3"><mark class="cf-falta">falta: equipo de la obra [29]</mark></td></tr>`;

  const documentacion = (data.participantes_documentacion || []).join('; ');

  return `
    <style>${CONTRACT_CSS}</style>
    <article class="contrato-doc">
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
      con domicilio contractual en ${campo(data, 'contratista_domicilio', '[8] Domicilio del contratista')},
      correo ${campo(data, 'contratista_email', '[9] Correo del contratista')},
      condición fiscal ${campo(data, 'contratista_condicion_fiscal', '[10] Condición fiscal del contratista')}
      y matrícula/registro ${campo(data, 'contratista_matricula', '[11] Matrícula del contratista')} cuando corresponda,
      en adelante el "CONTRATISTA", se celebra el presente contrato de obra.</p>

      <h2>1. OBJETO</h2>
      <p>El CONTRATISTA se obliga a ejecutar el trabajo en el inmueble sito en ${campo(data, 'obra_direccion_inmueble', '[12] Dirección del inmueble')},
      correspondiente al tipo/rubro ${campo(data, 'obra_tipo_rubro', '[13] Tipo/rubro')}.
      El alcance contratado es ${campo(data, 'obra_alcance', '[14] Alcance contratado')}.
      Quedan excluidos: ${campo(data, 'obra_exclusiones', '[15] Exclusiones')}.</p>

      <h2>2. PRECIO Y FORMA DE PAGO</h2>
      <p>El precio total es $ ${data.obra_precio_total != null ? money(data.obra_precio_total) : campo(data, 'obra_precio_total', '[16] Precio total')}
      en ${campo(data, 'obra_moneda', '[17] Moneda')},
      con el tratamiento de impuestos indicado en ${campo(data, 'obra_tratamiento_impuestos', '[18] Tratamiento de impuestos')}.
      El anticipo y/o forma inicial de pago será ${campo(data, 'obra_forma_pago_inicial', '[19] Forma de pago inicial')}.
      Los pagos posteriores se vinculan a los hitos acordados.</p>

      <h2>3. PLAZO</h2>
      <p>Fecha estimada de inicio: ${campo(data, 'obra_fecha_inicio', '[20] Fecha de inicio')}.
      Fecha estimada de finalización: ${campo(data, 'obra_fecha_fin', '[21] Fecha de finalización')}.
      Los cambios de plazo deben quedar documentados mediante una orden de cambio aceptada por ambas partes.</p>

      <h2>4. HITOS Y ENTREGABLES</h2>
      <table class="contrato-tabla">
        <thead><tr><th>#</th><th>Título [22]</th><th>Resultado verificable [23]</th><th>Monto [24]</th><th>Fecha objetivo [25]</th><th>Responsable [27]</th></tr></thead>
        <tbody>${hitosRows}</tbody>
      </table>
      <p>Criterio de aceptación: ${campo(data, 'hito_criterio_aceptacion', '[26] Criterio de aceptación')}.</p>
      <p>El COMITENTE aprobará u observará cada hito dentro del plazo indicado en ${campo(data, 'plazo_aprobacion_hitos', '[31] Plazo de aprobación de hitos')}.
      La observación debe identificar el incumplimiento concreto respecto del resultado o criterio acordado.</p>

      <h2>5. MATERIALES</h2>
      <p>Los materiales incluidos, excluidos y la parte responsable de comprarlos/proveerlos constan en:
      ${campo(data, 'materiales', '[28] Materiales incluidos/excluidos')}.
      Una sustitución que cambie calidad, precio o resultado requiere aceptación trazable.</p>

      <h2>6. EQUIPO Y MODALIDAD DE PARTICIPACIÓN</h2>
      <table class="contrato-tabla">
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
