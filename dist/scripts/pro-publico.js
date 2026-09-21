/* pro-publico.js — Perfil público del profesional, visto por el cliente.
   Se entra con pro-publico.html?id=<pro_id> desde la tarjeta de cualquier
   presupuesto recibido (mis-obras.html / client-solicitud.html).

   Solo muestra información pública: nombre, foto, rubros, localidad,
   verificación, clasificación, antigüedad y las obras que ese profesional
   ganó en Brickø. Nada de eso se lee directo de las tablas — `profiles`
   tiene RLS "solo el propio perfil" y `requests` "solo las propias", así
   que todo pasa por las RPC SECURITY DEFINER get_public_pro_profile() y
   get_public_pro_trabajos(), que además chequean que el que llama tenga
   una relación real con ese profesional (recibió un presupuesto suyo).
   Ver 20260921120000_perfil_publico_profesional.sql.

   No confundir con properfil.html: esa es la pantalla donde el profesional
   edita sus propios datos (incluidos los privados: DNI, CUIT, domicilio,
   matrícula). Acá no se edita nada ni se muestra ninguno de esos campos. */

const sb = window.supabase_client;

const RUBRO_LABELS = {
  albanileria: 'Albañilería',
  plomeria: 'Plomería',
  electricidad: 'Electricidad',
  gas: 'Gas',
  terminaciones: 'Terminaciones',
  exteriores: 'Exteriores',
  'limpieza-transporte': 'Limpieza y transporte',
  'diseno-planificacion': 'Diseño y Planificación',
  pintura: 'Pintura', carpinteria: 'Carpintería', herreria: 'Herrería', jardineria: 'Jardinería',
  'multi-gremio': 'Multi-gremio'
};

const STATUS_LABELS = {
  preparing: { label: 'En preparación', class: 'st-preparing' },
  active:    { label: 'En curso',       class: 'st-active' },
  done:      { label: 'Finalizada',     class: 'st-done' }
};

const TIPO_LABELS = { 'obra-nueva': 'Obra nueva', refaccion: 'Refacción' };

function getSession(){
  try {
    const s = localStorage.getItem('bricko-session') || sessionStorage.getItem('bricko-session');
    return s ? JSON.parse(s) : null;
  } catch(e){ return null; }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session || !session.userId){ window.location.replace('index.html'); return; }

  loadUserUI(session);
  initVolver();
  initLogout();
  initThemeToggle();

  const proId = new URLSearchParams(window.location.search).get('id');
  if (!proId){
    setState('No sabemos qué profesional querés ver: falta el identificador en el enlace.');
    return;
  }

  await loadPerfil(proId);
});

/* ── Nav ─────────────────────────────────────────────── */
function loadUserUI(session){
  const name = ((session.firstName || '') + ' ' + (session.lastName || '')).trim() || session.email?.split('@')[0] || 'Usuario';
  const initials = (session.firstName?.[0] || name[0] || 'U').toUpperCase();
  Auth.renderAvatarChip('userAv', session.avatarUrl, initials);
  const nm = document.getElementById('userNm');
  if (nm) nm.textContent = session.firstName || name;
}

// "Volver" tiene que devolver a la pantalla de la que se vino (mis-obras o
// el detalle de una solicitud puntual). El href de la plantilla queda como
// respaldo para cuando se entra con la URL pegada directo.
function initVolver(){
  const btn = document.getElementById('btnVolver');
  if (!btn) return;
  const from = document.referrer;
  if (!from || new URL(from, window.location.href).origin !== window.location.origin) return;
  btn.addEventListener('click', (e) => { e.preventDefault(); window.history.back(); });
}

/* ── Carga del perfil ────────────────────────────────── */
async function loadPerfil(proId){
  try {
    const [perfilRes, trabajosRes] = await Promise.all([
      sb.rpc('get_public_pro_profile', { p_pro_id: proId }),
      sb.rpc('get_public_pro_trabajos', { p_pro_id: proId })
    ]);

    if (perfilRes.error) throw perfilRes.error;

    const perfil = (perfilRes.data || [])[0];
    if (!perfil){
      // La RPC devuelve 0 filas tanto si el pro no existe como si el que
      // llama no tiene ninguna relación con él: no se distingue a propósito,
      // para no confirmar la existencia de una cuenta ajena.
      setState('No podés ver este perfil. El perfil público de un profesional está disponible para los clientes que recibieron un presupuesto suyo.');
      return;
    }

    if (trabajosRes.error) console.warn('Aviso cargando los trabajos del profesional:', trabajosRes.error);

    renderPerfil(perfil);
    renderTrabajos(trabajosRes.data || []);

    document.getElementById('ppState').hidden = true;
    document.getElementById('ppContent').hidden = false;
  } catch(err){
    console.error('Error cargando el perfil del profesional:', err);
    setState('No pudimos cargar el perfil. Probá de nuevo en un momento.');
  }
}

function setState(msg){
  const box = document.getElementById('ppState');
  const text = document.getElementById('ppStateText');
  if (text) text.textContent = msg;
  if (box) box.hidden = false;
  document.getElementById('ppContent').hidden = true;
}

/* ── Identidad, badges y métricas ────────────────────── */
function renderPerfil(p){
  const nombre = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Profesional';
  const initials = ((p.first_name?.[0] || '') + (p.last_name?.[0] || '')).toUpperCase() || 'P';

  document.title = `Brickø · ${nombre}`;
  document.getElementById('ppNombre').textContent = nombre;
  document.getElementById('ppAvatar').innerHTML = Auth.avatarChipHTML(p.avatar_url, initials);

  if (p.razon_social){
    const el = document.getElementById('ppRazon');
    el.textContent = p.razon_social;
    el.hidden = false;
  }

  // rubros[] es lo que edita properfil.html; `rubro` es la columna vieja de
  // un solo oficio y queda como respaldo para las cuentas que nunca se
  // actualizaron.
  const rubros = (p.rubros && p.rubros.length) ? p.rubros : (p.rubro ? [p.rubro] : []);
  const badges = [];
  if (p.verified) badges.push('<span class="pp-badge verified">✓ Verificado</span>');
  if (p.localidad) badges.push(`<span class="pp-badge">${escapeHTML(p.localidad)}</span>`);
  rubros.forEach(r => {
    badges.push(`<span class="pp-badge rubro">${escapeHTML(RUBRO_LABELS[r] || r)}</span>`);
  });
  if (!badges.length) badges.push('<span class="pp-badge">Sin rubros cargados</span>');
  document.getElementById('ppBadges').innerHTML = badges.join('');

  renderStats(p);

  if (p.bio && p.bio.trim()){
    document.getElementById('ppBio').textContent = p.bio.trim();
    document.getElementById('ppBioCard').hidden = false;
  }
}

function renderStats(p){
  // La clasificación solo se muestra cuando hay al menos una obra terminada
  // que la respalde: `professionals.rating` arranca en su valor por defecto y
  // hoy no hay ningún mecanismo que la recalcule, así que mostrar "5,0" en una
  // cuenta sin trabajos entregados sería decirle al cliente algo que no es.
  const finalizadas = p.obras_finalizadas || 0;
  const rating = finalizadas > 0 && p.rating != null
    ? `<div class="v">${Number(p.rating).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <small>/ 5</small></div>`
    : `<div class="v empty">Sin calificaciones</div>`;

  const desde = p.miembro_desde
    ? new Date(p.miembro_desde).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
    : '—';

  document.getElementById('ppStats').innerHTML = `
    <div class="pp-stat">${rating}<div class="k">Clasificación</div></div>
    <div class="pp-stat"><div class="v">${finalizadas}</div><div class="k">Obras finalizadas</div></div>
    <div class="pp-stat"><div class="v">${p.obras_en_curso || 0}</div><div class="k">Obras en curso</div></div>
    <div class="pp-stat"><div class="v empty">${escapeHTML(desde)}</div><div class="k">En Brickø desde</div></div>
  `;
}

/* ── Trabajos anteriores ─────────────────────────────── */
function renderTrabajos(trabajos){
  const grid = document.getElementById('ppJobs');
  const empty = document.getElementById('ppJobsEmpty');

  if (!trabajos.length){
    grid.innerHTML = '';
    grid.hidden = true;
    empty.hidden = false;
    return;
  }

  grid.hidden = false;
  empty.hidden = true;
  grid.innerHTML = trabajos.map(trabajoHTML).join('');
}

function trabajoHTML(t){
  const st = STATUS_LABELS[t.status] || { label: t.status, class: 'st-pending' };
  const titulo = t.titulo || (TIPO_LABELS[t.tipo] || 'Obra');
  const rubros = (t.rubros || []).map(r => RUBRO_LABELS[r] || r).join(', ');
  const lugar = [t.ciudad, t.provincia].filter(Boolean).join(', ');
  const fecha = t.actualizada_en
    ? new Date(t.actualizada_en).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    : null;
  const fechaLabel = t.status === 'done' ? 'Finalizada' : 'Última actividad';

  // La barra de avance solo tiene sentido mientras la obra está en curso:
  // una finalizada ya está al 100% y una en preparación todavía no tiene
  // hitos cargados.
  const avance = (t.status === 'active' && t.hitos_total > 0) ? (t.avance_pct || 0) : null;

  return `
    <article class="pp-job">
      <div class="pp-job-top">
        <span class="pp-job-ticket">${escapeHTML(t.ticket_id || '')}</span>
        <span class="obra-status-pill ${st.class}">${escapeHTML(st.label)}</span>
      </div>
      <h3>${escapeHTML(titulo)}</h3>
      <div class="pp-job-meta">
        <span><strong>Tipo:</strong> ${escapeHTML(TIPO_LABELS[t.tipo] || t.tipo || '—')}</span>
        ${rubros ? `<span><strong>Rubros:</strong> ${escapeHTML(rubros)}</span>` : ''}
        ${t.superficie ? `<span><strong>Superficie:</strong> ${escapeHTML(String(t.superficie))} m²</span>` : ''}
        ${lugar ? `<span><strong>Ubicación:</strong> ${escapeHTML(lugar)}</span>` : ''}
        ${fecha ? `<span><strong>${fechaLabel}:</strong> ${escapeHTML(fecha)}</span>` : ''}
      </div>
      ${avance !== null ? `
        <div class="pp-job-bar"><i style="width:${Math.max(0, Math.min(100, avance))}%"></i></div>
        <div class="pp-job-bar-label">${avance}% de avance</div>
      ` : ''}
    </article>
  `;
}

/* ── Logout ──────────────────────────────────────────── */
function initLogout(){
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    try { await Auth.logout(); } catch(e){
      localStorage.removeItem('bricko-session');
      sessionStorage.removeItem('bricko-session');
      localStorage.removeItem('bricko-user');
      window.location.replace('index.html');
    }
  });
}

/* ── Theme toggle ────────────────────────────────────── */
function initThemeToggle(){
  const THEMES = ['dark', 'light', 'blueprint'];
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const html = document.documentElement;
    html.classList.add('theme-anim');
    const next = THEMES[(THEMES.indexOf(html.getAttribute('data-theme') || 'dark') + 1) % THEMES.length];
    html.setAttribute('data-theme', next);
    localStorage.setItem('bricko-theme', next);
    setTimeout(() => html.classList.remove('theme-anim'), 450);
  });
}

function escapeHTML(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
