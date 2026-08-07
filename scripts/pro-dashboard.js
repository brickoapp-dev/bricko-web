/* pro-dashboard.js — Dashboard del profesional con perfil completo, modal de edición y feed filtrable */

const sb = window.supabase_client;

const URG_LABEL = { baja:'Baja', media:'Media', alta:'Urgente' };
const RUBRO_LABELS = {
  plomeria:'Plomería', gas:'Gas', electricidad:'Electricidad',
  albanileria:'Albañilería', pintura:'Pintura', carpinteria:'Carpintería',
  herreria:'Herrería', jardineria:'Jardinería', 'multi-gremio':'Multi-gremio'
};
const TIPO_LABEL = { refaccion:'Refacción', 'obra-nueva':'Obra Nueva', 'obra':'Obra Nueva' };

let ALL_REQUESTS = [];
let MY_QUOTES = new Map();
let PRO_PROFILE = null;
let FILTERS = { zone:'myzone', rubro:'all', tipo:'all', urgencia:'all' };

function getSession(){
  try {
    const s = localStorage.getItem('bricko-session') || sessionStorage.getItem('bricko-session');
    return s ? JSON.parse(s) : null;
  } catch(e){ return null; }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = getSession();
  if (!session || !session.userId){ window.location.replace('index.html'); return; }
  if (session.role !== 'profesional'){ window.location.replace('client.html'); return; }

  await loadProFullProfile(session);
  initFilters();
  initEditProfileModal();
  initLogout();
  initCursorGlow();

  await loadMyQuotes(session.userId);
  await loadRequests();
  updateStats();
});

/* ── Cargar Perfil Profesional Completo ─────────────────── */
async function loadProFullProfile(session){
  const userId = session.userId;
  let profileData = null;
  let proData = null;

  try {
    const { data: prof } = await sb.from('profiles').select('*').eq('id', userId).single();
    profileData = prof;
  } catch(e){ console.warn('Error leyendo profiles:', e); }

  try {
    const { data: pro } = await sb.from('professionals').select('*').eq('id', userId).single();
    proData = pro;
  } catch(e){ console.warn('Error leyendo professionals:', e); }

  const firstName = profileData?.first_name || session.firstName || '';
  const lastName = profileData?.last_name || session.lastName || '';
  const fullName = (firstName + ' ' + lastName).trim() || session.email?.split('@')[0] || 'Profesional';
  const username = profileData?.username || session.username || session.email?.split('@')[0] || 'profesional';
  const initials = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || 'BR';
  const city = profileData?.city || session.city || '';
  const province = profileData?.province || session.province || '';
  const address = profileData?.address || session.address || '';
  const avatarUrl = profileData?.avatar_url || session.avatarUrl || null;

  const rubros = proData?.rubros?.length ? proData.rubros : (session.rubros?.length ? session.rubros : (proData?.rubro ? [proData.rubro] : ['albanileria']));
  const primaryRubro = rubros[0] || 'albanileria';
  const dniNumber = proData?.dni_number || session.dniNumber || '—';
  const isVerified = proData?.verified !== false;

  PRO_PROFILE = {
    userId,
    firstName,
    lastName,
    fullName,
    username,
    initials,
    city,
    province,
    address,
    avatarUrl,
    rubros,
    primaryRubro,
    dniNumber,
    isVerified,
    rating: proData?.rating || 5.0,
    jobsCompleted: proData?.jobs_completed || 0,
    dniFrontUrl: proData?.dni_front_url || session.dniFrontUrl || null,
    dniBackUrl: proData?.dni_back_url || session.dniBackUrl || null
  };

  renderProfileUI();
}

function renderProfileUI(){
  if (!PRO_PROFILE) return;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Nav
  set('navUserName', PRO_PROFILE.firstName || PRO_PROFILE.fullName);
  set('navUserHandle', '@' + PRO_PROFILE.username);
  set('proNm', PRO_PROFILE.fullName);
  set('proInitials', PRO_PROFILE.initials);

  const mainRubroLabel = RUBRO_LABELS[PRO_PROFILE.primaryRubro] || PRO_PROFILE.primaryRubro;
  set('proTrade', PRO_PROFILE.rubros.length > 1 ? `${mainRubroLabel} (+${PRO_PROFILE.rubros.length - 1})` : mainRubroLabel);
  set('statRating', PRO_PROFILE.rating ? Number(PRO_PROFILE.rating).toFixed(1) : '5.0');

  const navImg = document.getElementById('proNavAvatarImg');
  const navInitials = document.getElementById('proInitials');
  if (navImg && PRO_PROFILE.avatarUrl) {
    navImg.src = PRO_PROFILE.avatarUrl;
    navImg.style.display = 'block';
    if (navInitials) navInitials.style.display = 'none';
  }

  // Hero Card
  set('proCardName', PRO_PROFILE.fullName);
  set('proCardUsername', '@' + PRO_PROFILE.username);
  set('proCardInitials', PRO_PROFILE.initials);

  const locText = [PRO_PROFILE.address, PRO_PROFILE.city, PRO_PROFILE.province].filter(Boolean).join(', ') || 'Ubicación no especificada';
  set('proCardLocation', locText);
  set('proCardDni', 'DNI: ' + PRO_PROFILE.dniNumber);

  const cardImg = document.getElementById('proCardAvatarImg');
  const cardInitials = document.getElementById('proCardInitials');
  if (cardImg && PRO_PROFILE.avatarUrl) {
    cardImg.src = PRO_PROFILE.avatarUrl;
    cardImg.style.display = 'block';
    if (cardInitials) cardInitials.style.display = 'none';
  }

  // Rubros Badges
  const rubrosContainer = document.getElementById('proCardRubros');
  if (rubrosContainer) {
    rubrosContainer.innerHTML = PRO_PROFILE.rubros.map(r => `
      <span class="rubro-tag active">${escapeHTML(RUBRO_LABELS[r] || r)}</span>
    `).join('');
  }

  // Verification Badge
  const badgeEl = document.getElementById('proVerificationBadge');
  if (badgeEl) {
    badgeEl.className = 'pro-status-badge ' + (PRO_PROFILE.isVerified ? 'verified' : 'pending');
    badgeEl.innerHTML = PRO_PROFILE.isVerified
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Verificado`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/></svg> Pendiente`;
  }
}

/* ── Mis quotes (para marcar cards como cotizadas) ── */
async function loadMyQuotes(proId){
  try {
    const { data, error } = await sb.from('quotes').select('id, request_id, amount, status').eq('pro_id', proId);
    if (error){ console.warn('Error cargando mis quotes:', error); return; }
    MY_QUOTES = new Map();
    (data || []).forEach(q => MY_QUOTES.set(q.request_id, q));
  } catch(err){ console.warn('Excepción cargando mis quotes:', err); }
}

/* ── Solicitudes abiertas ───────────────────────────── */
async function loadRequests(){
  try {
    const { data, error } = await sb
      .from('requests')
      .select('id, ticket_id, user_id, tipo, rubros, titulo, descripcion, urgencia, direccion, status, etapa, tipo_construccion, superficie, created_at, profiles!requests_user_id_fkey(first_name, last_name, city, province)')
      .in('status', ['pending','quoted'])
      .order('created_at', { ascending: false });
    if (error){ console.error('Error cargando solicitudes:', error); ALL_REQUESTS = []; }
    else { ALL_REQUESTS = (data || []).map(normalize); }
  } catch(err){ console.error('Excepción cargando solicitudes:', err); ALL_REQUESTS = []; }
  render();
}

function normalize(row){
  const clientName = ((row.profiles?.first_name || '') + ' ' + (row.profiles?.last_name?.[0] || '') + '.').trim() || 'Cliente';
  return {
    id: row.id,
    ticketId: row.ticket_id || ('SOL-' + row.id?.slice(0,4)),
    tipo: row.tipo,
    rubros: row.rubros || [],
    titulo: row.titulo || generateTitle(row),
    descripcion: row.descripcion,
    urgencia: row.urgencia,
    direccion: row.direccion,
    superficie: row.superficie,
    etapa: row.etapa,
    tipoConstruccion: row.tipo_construccion,
    status: row.status,
    createdAt: row.created_at,
    clientName,
    clientCity: row.profiles?.city || '',
    clientProvince: row.profiles?.province || '',
    primaryRubro: row.rubros?.[0] || 'multi-gremio'
  };
}

function generateTitle(row){
  if (row.tipo === 'refaccion' && row.rubros?.length)
    return row.rubros.map(r => RUBRO_LABELS[r] || r).join(' + ') + ' — Solicitud';
  if (row.tipo === 'obra-nueva')
    return (row.tipo_construccion
      ? row.tipo_construccion.charAt(0).toUpperCase() + row.tipo_construccion.slice(1)
      : 'Obra Nueva') + ' — Obra Nueva';
  return TIPO_LABEL[row.tipo] || 'Solicitud';
}

/* ── Filtros ────────────────────────────────────────── */
function initFilters(){
  ['filterZone', 'filterRubro','filterTipo','filterUrgencia'].forEach(group => {
    const container = document.getElementById(group);
    if (!container) return;
    container.querySelectorAll('.ftab').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const key = group.replace('filter','').toLowerCase();
        FILTERS[key] = btn.dataset.filter;
        render();
      });
    });
  });
}

/* ── Render del feed ────────────────────────────────── */
function render(){
  const feed = document.getElementById('requestsFeed');
  const empty = document.getElementById('feedEmpty');
  const total = document.getElementById('reqTotal');
  const eyebrow = document.getElementById('feedEyebrow');
  if (!feed) return;

  const proCity = (PRO_PROFILE?.city || '').toLowerCase();
  const proProvince = (PRO_PROFILE?.province || '').toLowerCase();

  const list = ALL_REQUESTS.filter(r => {
    // Filtro Ubicación / Zona
    if (FILTERS.zone === 'myzone' && (proCity || proProvince)) {
      const rCity = (r.clientCity || r.direccion || '').toLowerCase();
      const rProv = (r.clientProvince || '').toLowerCase();
      const matchCity = proCity && rCity.includes(proCity);
      const matchProv = proProvince && (rProv.includes(proProvince) || rCity.includes(proProvince));
      if (!matchCity && !matchProv && rCity !== '') return false;
    }

    // Filtro Rubro
    if (FILTERS.rubro !== 'all' && !r.rubros.includes(FILTERS.rubro)) return false;

    // Filtro Tipo
    if (FILTERS.tipo !== 'all'){
      const wanted = FILTERS.tipo === 'obra' ? 'obra-nueva' : FILTERS.tipo;
      if (r.tipo !== wanted) return false;
    }

    // Filtro Urgencia
    if (FILTERS.urgencia !== 'all' && r.urgencia !== FILTERS.urgencia) return false;

    return true;
  });

  if (eyebrow) {
    eyebrow.textContent = FILTERS.zone === 'myzone' && PRO_PROFILE?.city
      ? `OPORTUNIDADES EN ${PRO_PROFILE.city.toUpperCase()}`
      : `OPORTUNIDADES DE TRABAJO`;
  }

  if (total) total.textContent = list.length + ' solicitud' + (list.length === 1 ? '' : 'es');

  if (!list.length){
    feed.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  feed.innerHTML = list.map((r, i) => cardHTML(r, i)).join('');

  feed.querySelectorAll('[data-req]').forEach(card => {
    const go = () => { window.location.href = 'pro-cotizar.html?req=' + card.dataset.req; };
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); }
    });
  });
}

function cardHTML(r, i){
  const urgClass = 'urg-' + (r.urgencia || 'media');
  const obraClass = r.tipo === 'obra-nueva' ? ' t-obra' : '';
  const quoted = MY_QUOTES.has(r.id);
  return `
    <article class="req-card${quoted ? ' quoted' : ''}" data-req="${r.id}" tabindex="0" style="animation-delay:${i*0.045}s">
      ${quoted ? '<span class="rc-ribbon">✓ ENVIADO</span>' : ''}
      <div class="rc-head">
        <div class="rc-tags">
          <span class="rc-tag">${escapeHTML(RUBRO_LABELS[r.primaryRubro] || r.primaryRubro)}</span>
          <span class="rc-tag${obraClass}">${escapeHTML(TIPO_LABEL[r.tipo] || r.tipo)}</span>
        </div>
        <span class="rc-urg ${urgClass}">${escapeHTML(URG_LABEL[r.urgencia] || r.urgencia)}</span>
      </div>
      <h3 class="rc-title">${escapeHTML(r.titulo)}</h3>
      <p class="rc-desc">${escapeHTML((r.descripcion || '').slice(0,160))}${(r.descripcion?.length > 160) ? '…' : ''}</p>
      <div class="rc-foot">
        <span class="rc-loc">📍 ${escapeHTML(r.direccion || r.clientCity || 'Ubicación no especificada')}</span>
        <span class="sep"></span>
        <span>${timeAgo(r.createdAt)}</span>
      </div>
      <div class="rc-cta-row">
        <span class="rc-quotes">Cliente: ${escapeHTML(r.clientName)}</span>
        <span class="rc-go">${quoted ? 'Ya cotizada' : 'Ver y cotizar'} <span class="arrow"></span></span>
      </div>
    </article>
  `;
}

/* ── Modal Editar Perfil ────────────────────────────────── */
function initEditProfileModal(){
  const btnEdit = document.getElementById('btnEditProfile');
  const modal = document.getElementById('modalEditProfile');
  const btnClose = document.getElementById('btnCloseEditModal');
  const btnCancel = document.getElementById('btnCancelEditModal');
  const form = document.getElementById('formEditProfile');

  if (!btnEdit || !modal) return;

  const openModal = () => {
    if (!PRO_PROFILE) return;
    document.getElementById('editFirstName').value = PRO_PROFILE.firstName || '';
    document.getElementById('editLastName').value = PRO_PROFILE.lastName || '';
    document.getElementById('editUsername').value = PRO_PROFILE.username || '';
    document.getElementById('editDniNumber').value = PRO_PROFILE.dniNumber || '';
    document.getElementById('editAddress').value = PRO_PROFILE.address || '';
    document.getElementById('editCity').value = PRO_PROFILE.city || '';
    document.getElementById('editProvince').value = PRO_PROFILE.province || 'CABA';

    // Checkboxes rubros
    const cbs = document.querySelectorAll('#editRubrosSelect input[name="editRubro"]');
    cbs.forEach(cb => {
      cb.checked = PRO_PROFILE.rubros.includes(cb.value);
    });

    modal.style.display = 'flex';
  };

  const closeModal = () => { modal.style.display = 'none'; };

  btnEdit.addEventListener('click', openModal);
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = form.querySelector('.btn-submit-edit');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Guardando...';

    try {
      const fn = document.getElementById('editFirstName').value.trim();
      const ln = document.getElementById('editLastName').value.trim();
      const un = document.getElementById('editUsername').value.trim().replace(/^@/, '');
      const dni = document.getElementById('editDniNumber').value.trim();
      const addr = document.getElementById('editAddress').value.trim();
      const city = document.getElementById('editCity').value.trim();
      const prov = document.getElementById('editProvince').value;

      const selectedRubros = Array.from(document.querySelectorAll('#editRubrosSelect input[name="editRubro"]:checked')).map(cb => cb.value);

      if (!selectedRubros.length) {
        toast('err', 'Atención', 'Seleccioná al menos un rubro de trabajo.');
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Guardar Cambios';
        return;
      }

      // Archivos nuevos (si se subieron)
      let avatarUrl = PRO_PROFILE.avatarUrl;
      let dniFrontUrl = PRO_PROFILE.dniFrontUrl;
      let dniBackUrl = PRO_PROFILE.dniBackUrl;

      const avFile = document.getElementById('editAvatarFile')?.files?.[0];
      const dniFFile = document.getElementById('editDniFrontFile')?.files?.[0];
      const dniBFile = document.getElementById('editDniBackFile')?.files?.[0];

      if (avFile && Auth.uploadImage) avatarUrl = await Auth.uploadImage(avFile, 'avatars', 'avatar');
      if (dniFFile && Auth.uploadImage) dniFrontUrl = await Auth.uploadImage(dniFFile, 'documents', 'dni_front');
      if (dniBFile && Auth.uploadImage) dniBackUrl = await Auth.uploadImage(dniBFile, 'documents', 'dni_back');

      // Update profiles in Supabase
      const { error: pErr } = await sb.from('profiles').update({
        first_name: fn,
        last_name: ln,
        username: un,
        address: addr,
        city: city,
        province: prov,
        avatar_url: avatarUrl
      }).eq('id', PRO_PROFILE.userId);

      if (pErr) throw pErr;

      // Update professionals in Supabase
      const { error: proErr } = await sb.from('professionals').update({
        rubros: selectedRubros,
        rubro: selectedRubros[0],
        dni_number: dni,
        dni_front_url: dniFrontUrl,
        dni_back_url: dniBackUrl
      }).eq('id', PRO_PROFILE.userId);

      if (proErr) throw proErr;

      // Update session locally
      const updatedUser = {
        id: PRO_PROFILE.userId,
        firstName: fn,
        lastName: ln,
        username: un,
        email: session.email,
        role: 'profesional',
        oficio: selectedRubros[0],
        rubros: selectedRubros,
        address: addr,
        city: city,
        province: prov,
        dniNumber: dni,
        avatarUrl,
        dniFrontUrl,
        dniBackUrl
      };
      if (Auth._setSession) Auth._setSession(updatedUser);

      await loadProFullProfile(getSession());
      render();

      closeModal();
      toast('ok', 'Perfil actualizado', 'Tus datos se guardaron correctamente.');
    } catch(err) {
      console.error('Error al actualizar perfil:', err);
      toast('err', 'Error', err.message || 'No se pudo guardar la información.');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Guardar Cambios';
    }
  });
}

/* ── Stats del nav ──────────────────────────────────── */
function updateStats(){
  const newCount = ALL_REQUESTS.filter(r => !MY_QUOTES.has(r.id)).length;
  const myAccepted = [...MY_QUOTES.values()].filter(q => q.status === 'accepted').length;
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('statNew', newCount);
  set('statActive', myAccepted);
}

/* ── Logout ─────────────────────────────────────────── */
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

/* ── Toast ───────────────────────────────────────────── */
const TICONS = {
  ok:   '<path d="M20 6L9 17l-5-5"/>',
  err:  '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 11v5"/>'
};
function toast(type, title, msg){
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'ok' ? 'ok' : type === 'err' ? 'err' : '');
  el.innerHTML = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor">${TICONS[type] || TICONS.info}</svg><div><div class="t">${title}</div><div class="m">${msg}</div></div>`;
  stack.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 4200);
}

/* ── Cursor glow ─────────────────────────────────────── */
function initCursorGlow(){
  if (!window.matchMedia('(pointer:fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let raf = null;
  window.addEventListener('pointermove', (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      document.body.classList.add('spot-on');
      document.body.style.setProperty('--mx', e.clientX + 'px');
      document.body.style.setProperty('--my', e.clientY + 'px');
      raf = null;
    });
  });
  window.addEventListener('mouseleave', () => document.body.classList.remove('spot-on'));
}

/* ── Helpers ─────────────────────────────────────────── */
function timeAgo(dateStr){
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff/60000);
  if (min < 1) return 'recién';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.floor(min/60);
  if (h < 24) return 'hace ' + h + ' h';
  const days = Math.floor(h/24);
  if (days === 1) return 'ayer';
  if (days < 7) return 'hace ' + days + ' días';
  return d.toLocaleDateString('es-AR');
}

function escapeHTML(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
