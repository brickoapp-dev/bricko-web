/* 01-auth.js — Sistema de autenticación con Supabase */

const Auth = {
  STORAGE_KEY: 'bricko-session',

  // ---- API pública ----
  async register({firstName, lastName, email, phone, password, role, oficio}){
    const sb = window.supabase_client;
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          role: role || 'cliente',
          oficio: oficio || null
        }
      }
    });

    if (error) throw new Error(error.message);

    // Crear perfil en la tabla profiles
    const { error: profileError } = await sb.from('profiles').insert({
      id: data.user.id,
      first_name: firstName,
      last_name: lastName,
      phone: phone,
      role: role || 'cliente',
      city: ''
    });
    if (profileError) console.warn('Error creando perfil:', profileError.message);

    // Si es profesional, crear registro en professionals
    if (role === 'profesional' && oficio) {
      const { error: proError } = await sb.from('professionals').insert({
        id: data.user.id,
        rubro: oficio,
        years_experience: 0,
        verified: false,
        rating: 5.0,
        jobs_completed: 0,
        bio: ''
      });
      if (proError) console.warn('Error creando perfil profesional:', proError.message);
    }

    const user = {
      id: data.user.id,
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone,
      role: role || 'cliente',
      oficio: oficio || null
    };
    this._setSession(user);
    return user;
  },

  async login({email, password, remember}){
    const sb = window.supabase_client;
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw new Error(error.message === 'Invalid login credentials'
      ? 'Email o contraseña incorrectos'
      : error.message);

    // Cargar perfil desde la tabla profiles
    const { data: profile } = await sb.from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    const user = {
      id: data.user.id,
      firstName: profile?.first_name || data.user.user_metadata?.first_name || '',
      lastName: profile?.last_name || data.user.user_metadata?.last_name || '',
      email: data.user.email,
      phone: profile?.phone || data.user.user_metadata?.phone || '',
      role: profile?.role || 'cliente',
      oficio: data.user.user_metadata?.oficio || null
    };
    this._setSession(user, remember);
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
    this._render();
  },

  _setSession(user, remember = true){
    const session = {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      oficio: user.oficio,
      loggedAt: new Date().toISOString()
    };
    try {
      const store = remember ? localStorage : sessionStorage;
      store.setItem(this.STORAGE_KEY, JSON.stringify(session));
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
    const chip = document.getElementById('userChip');
    const body = document.body;
    if (session){
      body.classList.add('is-authed');
      chip.classList.add('show');
      const initials = ((session.firstName?.[0] || '') + (session.lastName?.[0] || '')).toUpperCase() || 'BR';
      document.getElementById('userAv').textContent = initials;
      document.getElementById('userNm').textContent = session.firstName;
      // Drawer
      document.getElementById('drawerAv').textContent = initials;
      document.getElementById('drawerName').textContent = session.firstName + ' ' + session.lastName;
      document.getElementById('drawerEmail').textContent = session.email;
      document.getElementById('drawerRole').textContent = session.role === 'profesional' ? 'PROFESIONAL' : 'CLIENTE';
      // Contar solicitudes del usuario
      this._updateRequestCount();
    } else {
      body.classList.remove('is-authed');
      chip.classList.remove('show');
      document.getElementById('userDrawer')?.classList.remove('open');
      document.getElementById('userDrawerOverlay')?.classList.remove('open');
      document.getElementById('userChip')?.setAttribute('aria-expanded', 'false');
    }
  },

  async _updateRequestCount(){
    const session = this.getSession();
    if (!session) return;
    try {
      const sb = window.supabase_client;
      const { count } = await sb.from('requests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.userId);
      document.getElementById('drawerReqsCount').textContent = count || '0';
    } catch(e){
      document.getElementById('drawerReqsCount').textContent = '0';
    }
  },

  async init(){
    // Verificar si hay sesión activa de Supabase
    const sb = window.supabase_client;
    const { data: { session } } = await sb.auth.getSession();
    if (session && !this.getSession()){
      // Hay sesión de Supabase pero no local — restaurar
      const { data: profile } = await sb.from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      const user = {
        id: session.user.id,
        firstName: profile?.first_name || session.user.user_metadata?.first_name || '',
        lastName: profile?.last_name || session.user.user_metadata?.last_name || '',
        email: session.user.email,
        phone: profile?.phone || '',
        role: profile?.role || 'cliente',
        oficio: session.user.user_metadata?.oficio || null
      };
      this._setSession(user);
    }
    this._render();

    // Escuchar cambios de sesión
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT'){
        try { localStorage.removeItem(this.STORAGE_KEY); } catch(e){}
        try { sessionStorage.removeItem(this.STORAGE_KEY); } catch(e){}
        this._render();
      }
    });
  }
};

Auth.init();
