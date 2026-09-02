/* carpeta.js — Vista pública de la carpeta de obra (carpeta.html?t=<token>).
   Página sin login: todo el filtrado de qué campos se muestran pasa por
   la RPC pública carpeta_publica() (SECURITY DEFINER, otorgada a "anon"),
   nunca por ocultar algo acá -- este archivo solo renderiza lo que esa
   RPC ya decidió que es público. */

const sb = window.supabase_client;

const HITO_ESTADO_LABEL = { pending: 'Pendiente', in_progress: 'En curso', review: 'A revisar', done: 'Finalizado' };
const HITO_ESTADO_CLASS = { pending: '', in_progress: 'warn', review: 'warn', done: 'ok' };
const DOC_PUBLICO_LABEL = { completo: 'Vigente', registrado: 'Por vencer', revisar: 'Vencido / pendiente' };
const DOC_PUBLICO_CLASS = { completo: 'ok', registrado: 'warn', revisar: 'err' };
const MODALIDAD_LABEL = {
  contratista: 'Contratista', colaborador_independiente: 'Colaborador independiente',
  dependiente: 'Dependiente', subcontratista: 'Subcontratista', profesional: 'Profesional'
};

function escapeHTML(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function renderInvalido() {
  document.getElementById('content').innerHTML = `
    <div class="invalido">
      <h1>Enlace no válido</h1>
      <p>Este link no existe, venció o fue revocado.</p>
    </div>`;
}

function renderCarpeta(data) {
  const hitos = data.hitos || [];
  const participantes = data.participantes || [];

  const hitosHTML = hitos.length
    ? hitos.map(h => `
        <div class="hito-row">
          <div><strong>${String(h.numero).padStart(2, '0')} · ${escapeHTML(h.titulo)}</strong><small>${escapeHTML(h.resultado || '')}</small></div>
          <span class="status-pill ${HITO_ESTADO_CLASS[h.estado] || ''}">${HITO_ESTADO_LABEL[h.estado] || h.estado}</span>
        </div>`).join('')
    : '<p class="empty">Todavía no hay hitos definidos.</p>';

  const participantesHTML = participantes.length
    ? participantes.map(p => `
        <div class="part-row">
          <div><strong>${escapeHTML(p.nombre)}</strong><small>${escapeHTML(p.especialidad || '')} · ${MODALIDAD_LABEL[p.modalidad] || escapeHTML(p.modalidad)}</small></div>
          <span class="status-pill ${DOC_PUBLICO_CLASS[p.estado_documentacion] || ''}">${DOC_PUBLICO_LABEL[p.estado_documentacion] || p.estado_documentacion}</span>
        </div>`).join('')
    : '<p class="empty">Todavía no hay participantes asignados.</p>';

  document.getElementById('content').innerHTML = `
    <span class="eyebrow">Carpeta de obra</span>
    <h1>${escapeHTML(data.titulo || data.ticket_id || 'Obra')}</h1>

    <div class="card">
      <div class="card-label">Identificación</div>
      <div class="hito-row">
        <div><strong>${escapeHTML(data.ticket_id || '—')}</strong><small>${escapeHTML(data.localidad || 'Localidad no informada')}</small></div>
        <span class="status-pill ${data.habilitada ? 'ok' : 'warn'}">${data.habilitada ? 'Habilitada' : 'En preparación'}</span>
      </div>
    </div>

    <div class="card">
      <div class="card-label">Hitos</div>
      ${hitosHTML}
    </div>

    <div class="card">
      <div class="card-label">Participantes</div>
      ${participantesHTML}
    </div>

    <p class="footer-note">Vista pública de solo lectura. No incluye datos personales, montos ni documentación privada.</p>
  `;
}

async function init() {
  const token = new URLSearchParams(window.location.search).get('t');
  if (!token) { renderInvalido(); return; }

  try {
    const { data, error } = await sb.rpc('carpeta_publica', { p_token: token });
    if (error || !data) { renderInvalido(); return; }
    renderCarpeta(data);
  } catch (e) {
    renderInvalido();
  }
}

document.addEventListener('DOMContentLoaded', init);
