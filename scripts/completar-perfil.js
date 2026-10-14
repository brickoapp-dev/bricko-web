/* completar-perfil.js — Primer ingreso con Google: elegir rol, teléfono,
   oficio (si es profesional) y aceptar términos. Guarda todo con la RPC
   completar_perfil(), que además marca profiles.perfil_completo = true. */

(function () {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const sb = window.supabase_client;

  /* ============ THEME TOGGLE ============ */
  const THEMES = ['dark', 'light', 'blueprint'];
  $('#themeToggle')?.addEventListener('click', () => {
    const html = document.documentElement;
    html.classList.add('theme-anim');
    const next = THEMES[(THEMES.indexOf(html.getAttribute('data-theme') || 'dark') + 1) % THEMES.length];
    html.setAttribute('data-theme', next);
    localStorage.setItem('bricko-theme', next);
    setTimeout(() => html.classList.remove('theme-anim'), 450);
  });

  /* ============ TOASTS ============ */
  const ICONS = {
    ok: '<path d="M20 6L9 17l-5-5"/>',
    err: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 11v5"/>'
  };
  function toast(type, title, msg) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type === 'ok' ? 'ok' : type === 'err' ? 'err' : '');
    el.innerHTML = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor">' + (ICONS[type] || ICONS.info) + '</svg>'
      + '<div><div class="t">' + title + '</div><div class="m">' + msg + '</div></div>';
    $('#toastStack').appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 4200);
  }

  /* ============ ROL ============ */
  let rol = 'cliente';
  function setRole(r) {
    rol = r;
    const tabs = $('#cpRoleTabs');
    tabs.setAttribute('data-role', r);
    $$('.role-tab', tabs).forEach(t => t.classList.toggle('active', t.dataset.role === r));
    $('#cpProFields').classList.toggle('hidden', r !== 'profesional');
  }
  $$('#cpRoleTabs .role-tab').forEach(t => t.addEventListener('click', () => setRole(t.dataset.role)));

  // Oficio principal: chips de selección única (la RPC guarda un solo oficio)
  $$('#cpOficioSelect input[name="cpOficio"]').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) $$('#cpOficioSelect input[name="cpOficio"]').forEach(o => { if (o !== cb) o.checked = false; });
  }));

  /* ============ TÉRMINOS ============ */
  const terms = $('#cpTerms'), privacy = $('#cpPrivacy'), submit = $('#cpSubmit');
  const actualizarBoton = () => { submit.disabled = !(terms.checked && privacy.checked); };
  terms.addEventListener('change', actualizarBoton);
  privacy.addEventListener('change', actualizarBoton);

  /* ============ VALIDACIÓN ============ */
  const isPhone = v => v.replace(/[^\d]/g, '').length >= 8;
  function fieldFail(input) {
    const field = input.closest('.field');
    field?.classList.add('invalid');
    input.classList.add('bad');
    input.addEventListener('input', () => { field?.classList.remove('invalid'); input.classList.remove('bad'); }, { once: true });
  }

  /* ============ CARGA INICIAL ============ */
  // Sin sesión → login. Perfil ya completo → dashboard. Si no, se
  // precargan nombre y apellido que vinieron de Google.
  async function cargar() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.replace('login.html'); return; }

    const { data: profile } = await sb.from('profiles')
      .select('first_name, last_name, phone, role, perfil_completo')
      .eq('id', session.user.id)
      .single();

    if (profile && profile.perfil_completo !== false) {
      Auth._redirectToDashboard(profile.role);
      return;
    }

    const meta = session.user.user_metadata || {};
    $('#cpName').value = profile?.first_name || meta.given_name || '';
    $('#cpLast').value = profile?.last_name || meta.family_name || '';
    $('#cpPhone').value = profile?.phone || '';
    if (session.user.email) $('#cpSub').textContent = `Entraste como ${session.user.email}. Un paso más y empezás.`;

    // Si venía de "Registrate como profesional" (register.html?role=profesional)
    if (new URLSearchParams(window.location.search).get('role') === 'profesional') setRole('profesional');
  }

  /* ============ GUARDAR ============ */
  $('#completarForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fn = $('#cpName'), ln = $('#cpLast'), phone = $('#cpPhone');
    let ok = true;
    if (fn.value.trim().length < 2) { fieldFail(fn); ok = false; }
    if (ln.value.trim().length < 2) { fieldFail(ln); ok = false; }
    if (!isPhone(phone.value)) { fieldFail(phone); ok = false; }

    const oficio = $('#cpOficioSelect input[name="cpOficio"]:checked')?.value || null;
    if (rol === 'profesional' && !oficio) {
      toast('err', 'Falta el oficio', 'Elegí tu oficio principal.');
      ok = false;
    }
    if (!terms.checked || !privacy.checked) {
      toast('err', 'Falta un paso', 'Tenés que aceptar los Términos y leer la Política de Privacidad.');
      ok = false;
    }
    if (!ok) return;

    submit.classList.add('loading');
    submit.disabled = true;
    const { error } = await sb.rpc('completar_perfil', {
      p_role: rol,
      p_first_name: fn.value.trim(),
      p_last_name: ln.value.trim(),
      p_phone: phone.value.trim(),
      p_oficio: rol === 'profesional' ? oficio : null,
      p_terminos_version: window.BRICKO_LEGAL?.terminos?.version || null,
      p_privacidad_version: window.BRICKO_LEGAL?.privacidad?.version || null
    });

    if (error) {
      submit.classList.remove('loading');
      actualizarBoton();
      toast('err', 'No se pudo guardar', error.message || 'Probá de nuevo.');
      return;
    }

    // Actualiza la sesión local con los datos nuevos: los dashboards leen
    // bricko-session de forma sincrónica al cargar y sin ella vuelven al inicio.
    const actual = Auth.getSession();
    if (actual) {
      const recordar = !!localStorage.getItem(Auth.STORAGE_KEY);
      Auth._setSession({
        ...actual,
        id: actual.userId,
        firstName: fn.value.trim(),
        lastName: ln.value.trim(),
        role: rol,
        oficio: rol === 'profesional' ? oficio : null,
        rubros: rol === 'profesional' ? [oficio] : [],
        perfilCompleto: true
      }, recordar);
    }
    Auth._redirectToDashboard(rol);
  });

  $('#cpSalir').addEventListener('click', (e) => { e.preventDefault(); Auth.logout(); });

  cargar();
})();
