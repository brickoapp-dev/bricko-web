/* 01-auth.js — Autenticación con Supabase + redirect según rol + datos de profesional */

const Auth = {
  STORAGE_KEY: 'bricko-session',
  USER_KEY: 'bricko-user',

  _isIndexPage(){
    return !!document.getElementById('authLogin') || !!document.getElementById('authRegister');
  },

  _redirectToDashboard(role){
    const target = role === 'profesional' ? 'pro.html' : 'client.html';
    window.location.href = target;
  },

  // Helper para convertir archivo a DataURL si no hay bucket disponible
  fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  },

  _fileExt(file){
    return (file?.name ? file.name.split('.').pop() : 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  },

  // Subir archivo a Supabase Storage, con fallback a DataURL si falla (ej. sin
  // conexión). bucket público -> devuelve la url pública; bucket privado
  // (ej. 'dni') -> devuelve el path guardado, para pedir una signed URL al
  // mostrarlo (nadie más puede leer ese path por RLS).
  async uploadImage(file, bucket, path, isPublic = true) {
    if (!file) return null;
    const sb = window.supabase_client;
    if (sb && sb.storage) {
      try {
        const { error } = await sb.storage.from(bucket).upload(path, file, {
          upsert: true,
          contentType: file.type
        });
        if (!error) {
          if (!isPublic) return path;
          const { data: publicUrlData } = sb.storage.from(bucket).getPublicUrl(path);
          if (publicUrlData?.publicUrl) return publicUrlData.publicUrl;
        } else {
          console.warn(`Error subiendo ${bucket}/${path}:`, error.message);
        }
      } catch(e) {
        console.warn(`Error subiendo ${bucket}/${path}:`, e.message);
      }
    }
    return await this.fileToDataURL(file);
  },

  // ---- API pública ----
  async register({
    firstName,
    lastName,
    email,
    phone,
    password,
    role = 'cliente',
    username = '',
    address = '',
    city = '',
    province = '',
    rubros = [],
    dniNumber = '',
    avatarFile = null,
    dniFrontFile = null,
    dniBackFile = null,
    oficio = null,
    terminosVersion = null,
    terminosAceptadoEn = null,
    privacidadVersion = null,
    privacidadLeidaEn = null
  }) {
    const sb = window.supabase_client;

    const selectedRubros = rubros && rubros.length ? rubros : (oficio ? [oficio] : []);
    const primaryRubro = selectedRubros[0] || oficio || 'albanileria';

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          role: role,
          username: username || email.split('@')[0],
          address: address,
          city: city,
          province: province,
          oficio: primaryRubro,
          rubros: selectedRubros
        }
      }
    });

    if (error) throw new Error(error.message);

    const userId = data.user.id;

    // Las imágenes se suben recién acá: hasta que exista la sesión creada
    // por signUp(), las policies de storage.objects no pueden evaluar
    // auth.uid() y cualquier subida sería rechazada por RLS.
    let avatarUrl = null;
    let dniFrontPath = null;
    let dniBackPath = null;

    if (avatarFile) avatarUrl = await this.uploadImage(avatarFile, 'avatars', `${userId}/avatar.${this._fileExt(avatarFile)}`, true);
    if (dniFrontFile) dniFrontPath = await this.uploadImage(dniFrontFile, 'dni', `${userId}/dni-front.${this._fileExt(dniFrontFile)}`, false);
    if (dniBackFile) dniBackPath = await this.uploadImage(dniBackFile, 'dni', `${userId}/dni-back.${this._fileExt(dniBackFile)}`, false);

    // Profiles upsert
    const { error: profileError } = await sb.from('profiles').upsert({
      id: userId,
      first_name: firstName,
      last_name: lastName,
      phone: phone,
      role: role,
      city: city || '',
      address: address || '',
      province: province || '',
      username: username || email.split('@')[0],
      avatar_url: avatarUrl,
      terminos_version: terminosVersion,
      terminos_aceptado_en: terminosAceptadoEn,
      privacidad_version: privacidadVersion,
      privacidad_leida_en: privacidadLeidaEn
    }, { onConflict: 'id' });
    if (profileError) console.warn('Error creando perfil:', profileError.message);

    // If professional, upsert professionals (directorio público) y
    // professional_verification (DNI: tabla privada, solo el dueño la lee)
    if (role === 'profesional') {
      const { error: proError } = await sb.from('professionals').upsert({
        id: userId,
        rubro: primaryRubro,
        rubros: selectedRubros
      }, { onConflict: 'id' });
      if (proError) console.warn('Error creando perfil profesional:', proError.message);

      if (dniNumber || dniFrontPath || dniBackPath) {
        const { error: verifError } = await sb.from('professional_verification').upsert({
          id: userId,
          dni_number: dniNumber || null,
          dni_front_url: dniFrontPath,
          dni_back_url: dniBackPath
        }, { onConflict: 'id' });
        if (verifError) console.warn('Error guardando verificación de DNI:', verifError.message);
      }
    }

    const user = {
      id: userId,
      firstName,
      lastName,
      username: username || email.split('@')[0],
      email: email.toLowerCase(),
      phone,
      role,
      oficio: primaryRubro,
      rubros: selectedRubros,
      address,
      city,
      province,
      dniNumber,
      avatarUrl,
      dniFrontUrl: dniFrontPath,
      dniBackUrl: dniBackPath
    };
    this._setSession(user);

    this._redirectToDashboard(user.role);
    return user;
  },

  async login({email, password, remember}){
    const sb = window.supabase_client;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) throw new Error(error.message === 'Invalid login credentials'
      ? 'Email o contraseña incorrectos'
      : error.message);

    const { data: profile } = await sb.from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    let proData = null;
    let verifData = null;
    if ((profile?.role || data.user.user_metadata?.role) === 'profesional') {
      const { data: pro } = await sb.from('professionals')
        .select('*')
        .eq('id', data.user.id)
        .single();
      proData = pro;
      const { data: verif } = await sb.from('professional_verification')
        .select('dni_number, dni_front_url, dni_back_url')
        .eq('id', data.user.id)
        .maybeSingle();
      verifData = verif;
    }

    const user = {
      id: data.user.id,
      firstName: profile?.first_name || data.user.user_metadata?.first_name || '',
      lastName: profile?.last_name || data.user.user_metadata?.last_name || '',
      username: profile?.username || data.user.user_metadata?.username || data.user.email?.split('@')[0] || '',
      email: data.user.email,
      phone: profile?.phone || data.user.user_metadata?.phone || '',
      role: profile?.role || 'cliente',
      address: profile?.address || data.user.user_metadata?.address || '',
      city: profile?.city || data.user.user_metadata?.city || '',
      province: profile?.province || data.user.user_metadata?.province || '',
      avatarUrl: profile?.avatar_url || data.user.user_metadata?.avatar_url || null,
      oficio: proData?.rubro || data.user.user_metadata?.oficio || null,
      rubros: proData?.rubros || data.user.user_metadata?.rubros || (proData?.rubro ? [proData.rubro] : []),
      dniNumber: verifData?.dni_number || '',
      dniFrontUrl: verifData?.dni_front_url || null,
      dniBackUrl: verifData?.dni_back_url || null
    };
    this._setSession(user, remember);

    this._redirectToDashboard(user.role);
    return user;
  },

  async resetPassword({email}){
    const sb = window.supabase_client;
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw new Error(error.message);
    return true;
  },

  async logout(){
    const sb = window.supabase_client;
    await sb.auth.signOut();
    try { localStorage.removeItem(this.STORAGE_KEY); } catch(e){}
    try { sessionStorage.removeItem(this.STORAGE_KEY); } catch(e){}
    try { localStorage.removeItem(this.USER_KEY); } catch(e){}
    try { sessionStorage.removeItem(this.USER_KEY); } catch(e){}
    window.location.replace('index.html');
  },

  _setSession(user, remember = true){
    const session = {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username || user.email?.split('@')[0],
      role: user.role,
      oficio: user.oficio,
      rubros: user.rubros || [],
      address: user.address || '',
      city: user.city || '',
      province: user.province || '',
      avatarUrl: user.avatarUrl || null,
      dniNumber: user.dniNumber || '',
      dniFrontUrl: user.dniFrontUrl || null,
      dniBackUrl: user.dniBackUrl || null,
      loggedAt: new Date().toISOString()
    };
    const simpleUser = {
      id: user.id,
      name: (user.firstName + ' ' + user.lastName).trim() || user.username || user.email?.split('@')[0],
      email: user.email,
      role: user.role,
      username: user.username
    };

    try {
      const store = remember ? localStorage : sessionStorage;
      store.setItem(this.STORAGE_KEY, JSON.stringify(session));
      store.setItem(this.USER_KEY, JSON.stringify(simpleUser));
    } catch(e){}
    this._render();
  },

  getSession(){
    try {
      const s = localStorage.getItem(this.STORAGE_KEY) || sessionStorage.getItem(this.STORAGE_KEY);
      return s ? JSON.parse(s) : null;
    } catch(e){ return null; }
  },

  _render(){
    const session = this.getSession();
    const body = document.body;
    if (session){
      body?.classList.add('is-authed');
      const initials = ((session.firstName?.[0] || '') + (session.lastName?.[0] || '')).toUpperCase() || 'BR';

      const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };
      const addClass = (id, cls) => document.getElementById(id)?.classList.add(cls);

      addClass('userChip', 'show');
      set('userAv', initials);
      set('userNm', session.firstName);

      const avatarEl = document.getElementById('userAvatarImg');
      if (avatarEl && session.avatarUrl) {
        avatarEl.src = session.avatarUrl;
        avatarEl.style.display = 'block';
        const initialsEl = document.getElementById('userAv');
        if (initialsEl) initialsEl.style.display = 'none';
      }

      set('drawerAv', initials);
      set('drawerName', session.firstName + ' ' + session.lastName);
      set('drawerEmail', session.email);
      set('drawerRole', session.role === 'profesional' ? 'PROFESIONAL' : 'CLIENTE');
      this._updateRequestCount();
    } else {
      body?.classList.remove('is-authed');
      document.getElementById('userChip')?.classList.remove('show');
      document.getElementById('userDrawer')?.classList.remove('open');
      document.getElementById('userDrawerOverlay')?.classList.remove('open');
      document.getElementById('userChip')?.setAttribute('aria-expanded', 'false');
    }
  },

  async _updateRequestCount(){
    const session = this.getSession();
    if (!session) return;
    const el = document.getElementById('drawerReqsCount');
    if (!el) return;
    try {
      const sb = window.supabase_client;
      const { count } = await sb.from('requests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.userId);
      el.textContent = count || '0';
    } catch(e){
      el.textContent = '0';
    }
  },

  async init(){
    const sb = window.supabase_client;
    if (!sb) {
      console.warn('Supabase client no disponible en Auth.init()');
      this._render();
      return;
    }

    const { data: { session } } = await sb.auth.getSession();

    if (session && !this.getSession()){
      const { data: profile } = await sb.from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      let proData = null;
      let verifData = null;
      if ((profile?.role || session.user.user_metadata?.role) === 'profesional') {
        const { data: pro } = await sb.from('professionals').select('*').eq('id', session.user.id).single();
        proData = pro;
        const { data: verif } = await sb.from('professional_verification')
          .select('dni_number, dni_front_url, dni_back_url')
          .eq('id', session.user.id)
          .maybeSingle();
        verifData = verif;
      }

      const user = {
        id: session.user.id,
        firstName: profile?.first_name || session.user.user_metadata?.first_name || '',
        lastName: profile?.last_name || session.user.user_metadata?.last_name || '',
        username: profile?.username || session.user.user_metadata?.username || '',
        email: session.user.email,
        phone: profile?.phone || '',
        role: profile?.role || 'cliente',
        address: profile?.address || '',
        city: profile?.city || '',
        province: profile?.province || '',
        avatarUrl: profile?.avatar_url || null,
        oficio: proData?.rubro || session.user.user_metadata?.oficio || null,
        rubros: proData?.rubros || session.user.user_metadata?.rubros || [],
        dniNumber: verifData?.dni_number || '',
        dniFrontUrl: verifData?.dni_front_url || null,
        dniBackUrl: verifData?.dni_back_url || null
      };
      this._setSession(user);
    }

    this._render();

    const currentSession = this.getSession();
    if (currentSession && this._isIndexPage()){
      this._redirectToDashboard(currentSession.role);
      return;
    }

    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT'){
        try { localStorage.removeItem(this.STORAGE_KEY); } catch(e){}
        try { sessionStorage.removeItem(this.STORAGE_KEY); } catch(e){}
        try { localStorage.removeItem(this.USER_KEY); } catch(e){}
        try { sessionStorage.removeItem(this.USER_KEY); } catch(e){}
        this._render();
      }
    });
  }
};

// Global Listener para actualización de UI en cajas de subida de archivos (.file-upload-box)
document.addEventListener('change', (e) => {
  if (e.target && e.target.matches('.file-upload-box input[type="file"]')) {
    const box = e.target.closest('.file-upload-box');
    const titleEl = box?.querySelector('.file-upload-title');
    if (box && titleEl) {
      if (!box.dataset.defaultTitle) {
        box.dataset.defaultTitle = titleEl.textContent;
      }
      if (e.target.files && e.target.files[0]) {
        titleEl.textContent = '✓ ' + e.target.files[0].name;
        box.classList.add('has-file');
      } else {
        titleEl.textContent = box.dataset.defaultTitle;
        box.classList.remove('has-file');
      }
    }
  }
});

Auth.init();

// Botón/gesto "atrás" nativo de Android: navega el historial de la WebView
// en vez de cerrar la app (Capacitor no lo maneja por defecto).
if (window.Capacitor?.isNativePlatform?.()) {
  window.Capacitor.Plugins.App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      window.Capacitor.Plugins.App.exitApp();
    }
  });
}

