/* 01-auth.js — Autenticación con Supabase + redirect según rol */

const Auth = {
  STORAGE_KEY: 'bricko-session',
  USER_KEY: 'bricko-user', // Convención usada por client-dashboard.js, pro-dashboard.js y request-form.js

  // Detecta si estamos en la landing (index.html) o en una página interna
  _isIndexPage(){
    return !!document.getElementById('authLogin') || !!document.getElementById('authRegister');
  },

  // Redirige al dashboard correspondiente según el rol
  _redirectToDashboard(role){
    const target = role === 'profesional' ? 'pro.html' : 'client.html';
    window.location.href = target;
  },

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

    // Crear perfil en profiles
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
      firstName, lastName,
      email: email.toLowerCase(),
      phone,
      role: role || 'cliente',
      oficio: oficio || null
    };
    this._setSession(user);

    // Redirigir al dashboard según rol
    this._redirectToDashboard(user.role);
    return user;
  },

  async login({email, password, remember}){
    const sb = window.supabase_client;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) throw new Error(error.message === 'Invalid login credentials'
      ? 'Email o contraseña incorrectos'
      : error.message);

    // Cargar perfil desde profiles
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

    // Redirigir al dashboard según rol
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
    // Volver a la landing
    window.location.replace('index.html');
  },

  _setSession(user, remember = true){
    // Formato propio (bricko-session)
    const session = {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      oficio: user.oficio,
      loggedAt: new Date().toISOString()
    };
    // Formato esperado por los scripts nuevos de Alan (bricko-user)
    const simpleUser = {
      id: user.id,
      name: (user.firstName + ' ' + user.lastName).trim() || user.email?.split('@')[0],
      email: user.email,
      role: user.role
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

  // Render seguro — solo actualiza elementos que existan en la página actual
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
      // Drawer (solo si existe — old index.html)
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
    if (!el) return; // Solo en old index.html
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

    // Hay sesión de Supabase pero no datos locales: restaurar
    if (session && !this.getSession()){
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

    // Si estamos en index.html y hay sesión activa, redirigir al dashboard
    const currentSession = this.getSession();
    if (currentSession && this._isIndexPage()){
      this._redirectToDashboard(currentSession.role);
      return;
    }

    // Escuchar cambios de sesión (logout desde otra tab, expiración, etc.)
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

Auth.init();