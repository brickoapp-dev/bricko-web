/* 05-dashboard.js — Dashboard dinámico conectado a Supabase */

var RUBROS_LABELS = RUBROS_LABELS || { plomeria:'Plomería', gas:'Gas', electricidad:'Electricidad', albanileria:'Albañilería', pintura:'Pintura' };
var TIPOS_LABELS  = TIPOS_LABELS  || { refaccion:'Refacción', 'obra-nueva':'Obra Nueva' };
const Dashboard = window.Dashboard = {
  overlay: null,
  sideEl: null,
  _cachedRequests: [],
  _cachedClientQuotes: [],
  _cachedMyQuotes: [],

  init(){
    this.overlay = document.getElementById('dashboard');
    this.sideEl = document.getElementById('dashSide');

    document.getElementById('dashClose').addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.classList.contains('open')) this.close();
    });

    document.getElementById('dashSideToggle').addEventListener('click', () => {
      this.sideEl.classList.toggle('open');
    });

    document.querySelectorAll('.dash-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        this.go(item.dataset.view);
        this.sideEl.classList.remove('open');
      });
    });

    document.querySelectorAll('[data-view-goto]').forEach(b => {
      b.addEventListener('click', () => this.go(b.dataset.viewGoto));
    });

    document.querySelectorAll('[data-dash-close]').forEach(el => {
      el.addEventListener('click', () => this.close());
    });

    document.getElementById('dashLogout').addEventListener('click', () => {
      Auth.logout();
      this.close();
      toast('info', 'Sesión cerrada', 'Hasta la próxima.');
    });

    document.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === btn));
        this._renderRequests(document.getElementById('reqSearch').value);
      });
    });
    document.getElementById('reqSearch').addEventListener('input', (e) => {
      this._renderRequests(e.target.value);
    });

    document.getElementById('profSave').addEventListener('click', () => this._saveProfile());

    document.querySelectorAll('[data-dash-open]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const view = el.dataset.dashOpen || 'overview';
        this.open(view);
      });
    });
  },

  open(view = 'overview'){
    if (!Auth.getSession()){
      openModal('login');
      return;
    }
    this.overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    this._renderAll();
    this.go(view);
  },

  close(){
    this.overlay.classList.remove('open');
    document.body.style.overflow = '';
  },

  go(view){
    document.querySelectorAll('.dash-nav-item').forEach(i => {
      i.classList.toggle('active', i.dataset.view === view);
    });
    document.querySelectorAll('.dash-view').forEach(v => {
      v.classList.toggle('active', v.dataset.view === view);
    });
    const isPro = this._isPro();
    const titles = isPro ? {
      overview: ['Mi panel', 'PANEL'],
      requests: ['Solicitudes disponibles', 'FEED'],
      quotes: ['Mis presupuestos', 'COTIZACIONES'],
      messages: ['Mensajes', 'CHATS'],
      payments: ['Mis cobros', 'PAGOS'],
      profile: ['Mi perfil', 'CUENTA']
    } : {
      overview: ['Mi panel', 'PANEL'],
      requests: ['Mis solicitudes', 'SOLICITUDES'],
      quotes: ['Presupuestos', 'COTIZACIONES'],
      messages: ['Mensajes', 'CHATS'],
      payments: ['Pagos y facturas', 'PAGOS'],
      profile: ['Mi perfil', 'CUENTA']
    };
    const [h, crumb] = titles[view] || titles.overview;
    document.getElementById('dashH1').textContent = h;
    document.getElementById('dashCrumb').textContent = crumb;
    document.querySelector('.dash-content').scrollTop = 0;
  },

  /* ========== DATA LOADING ========== */

  async _renderAll(){
    const session = Auth.getSession();
    const initials = ((session.firstName?.[0] || '') + (session.lastName?.[0] || '')).toUpperCase() || 'BR';
    document.getElementById('dashSideAv').textContent = initials;
    document.getElementById('dashSideName').textContent = session.firstName + ' ' + session.lastName;
    document.getElementById('dashSideEmail').textContent = session.email;

    document.getElementById('profName').value = session.firstName || '';
    document.getElementById('profLast').value = session.lastName || '';
    document.getElementById('profEmail').value = session.email || '';
    document.getElementById('profPhone').value = session.phone || '';
    document.getElementById('profAvatar').textContent = initials;
    document.getElementById('profDisplayName').textContent = session.firstName + ' ' + session.lastName;
    document.getElementById('profDisplayEmail').textContent = session.email;
    document.getElementById('profStat4').textContent = session.role === 'profesional' ? 'PRO' : 'CLIENTE';

    const isPro = session.role === 'profesional';

    if (isPro) {
      this._cachedRequests = await this._loadOpenRequests();
      this._cachedMyQuotes = await this._loadProQuotes();
    } else {
      this._cachedRequests = await this._loadRequests();
      this._cachedClientQuotes = await this._loadClientQuotes();
    }

    this._renderRequests('');
    this._renderOverview();
    this._renderQuotesView();
    this._renderMessagesView();
    this._renderPaymentsView();
  },

  _isPro(){
    const s = Auth.getSession();
    return s && s.role === 'profesional';
  },

  async _loadOpenRequests(){
    try {
      const sb = window.supabase_client;
      const { data, error } = await sb.from('requests')
        .select('*, profiles:user_id(first_name, last_name, city)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(r => ({
        id: r.id, ticketId: r.ticket_id, tipo: r.tipo,
        rubros: r.rubros || [], descripcion: r.descripcion,
        direccion: r.direccion, ciudad: r.ciudad, provincia: r.provincia,
        urgencia: r.urgencia, status: r.status, createdAt: r.created_at,
        clientName: r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : 'Cliente',
        clientCity: r.profiles?.city || r.ciudad || ''
      }));
    } catch(e){ console.error('Error cargando solicitudes abiertas:', e); return []; }
  },

  async _loadRequests(){
    const session = Auth.getSession();
    if (!session) return [];
    try {
      const sb = window.supabase_client;
      const { data, error } = await sb.from('requests')
        .select('*')
        .eq('user_id', session.userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(r => ({
        id: r.id, ticketId: r.ticket_id, tipo: r.tipo,
        rubros: r.rubros || [], descripcion: r.descripcion,
        direccion: r.direccion, ciudad: r.ciudad, provincia: r.provincia,
        urgencia: r.urgencia, status: r.status, createdAt: r.created_at
      }));
    } catch(e){ console.error('Error cargando solicitudes:', e); return []; }
  },

  async _loadClientQuotes(){
    const session = Auth.getSession();
    if (!session) return [];
    try {
      const sb = window.supabase_client;
      const { data, error } = await sb.from('quotes')
        .select('*, requests!inner(ticket_id, descripcion, user_id, tipo, rubros, ciudad), profiles:pro_id(first_name, last_name), professionals:pro_id(rubro, rating, years_experience)')
        .eq('requests.user_id', session.userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch(e){ console.error('Error cargando presupuestos del cliente:', e); return []; }
  },

  async _loadProQuotes(){
    const session = Auth.getSession();
    if (!session) return [];
    try {
      const sb = window.supabase_client;
      const { data, error } = await sb.from('quotes')
        .select('*, requests(ticket_id, descripcion, tipo, rubros, ciudad, status)')
        .eq('pro_id', session.userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch(e){ console.error('Error cargando mis presupuestos:', e); return []; }
  },

  /* ========== OVERVIEW (KPIs + últimas solicitudes) ========== */

  _renderOverview(){
    const isPro = this._isPro();
    const reqs = this._cachedRequests || [];
    const quotes = isPro ? (this._cachedMyQuotes || []) : (this._cachedClientQuotes || []);

    const activeReqs = reqs.filter(r => ['pending','quoted','active'].includes(r.status)).length;
    const totalReqs = reqs.length;
    const pendingQuotes = quotes.filter(q => q.status === 'pending').length;
    const acceptedQuotes = quotes.filter(q => q.status === 'accepted').length;

    const kpiContainer = document.querySelector('[data-view="overview"] .kpi-grid');
    if (kpiContainer) {
      if (isPro) {
        kpiContainer.innerHTML = `
          <div class="kpi">
            <div class="kpi-lbl">/01 — SOLICITUDES DISPONIBLES</div>
            <div class="kpi-val">${reqs.length}</div>
            <div class="kpi-trend"><span class="kpi-delta flat">→ ABIERTAS PARA COTIZAR</span></div>
          </div>
          <div class="kpi">
            <div class="kpi-lbl">/02 — PRESUPUESTOS ENVIADOS</div>
            <div class="kpi-val">${quotes.length}</div>
            <div class="kpi-trend"><span class="kpi-delta flat">→ ${acceptedQuotes} ACEPTADOS</span></div>
          </div>
          <div class="kpi">
            <div class="kpi-lbl">/03 — PENDIENTES DE RESPUESTA</div>
            <div class="kpi-val">${pendingQuotes}</div>
            <div class="kpi-trend"><span class="kpi-delta flat">→ ESPERANDO AL CLIENTE</span></div>
          </div>
          <div class="kpi">
            <div class="kpi-lbl">/04 — TASA DE ACEPTACIÓN</div>
            <div class="kpi-val">${quotes.length > 0 ? Math.round((acceptedQuotes / quotes.length) * 100) : 0} <span class="unit">%</span></div>
            <div class="kpi-trend"><span class="kpi-delta flat">→ GLOBAL</span></div>
          </div>`;
      } else {
        kpiContainer.innerHTML = `
          <div class="kpi">
            <div class="kpi-lbl">/01 — SOLICITUDES ACTIVAS</div>
            <div class="kpi-val">${activeReqs} <span class="unit">/ ${totalReqs}</span></div>
            <div class="kpi-trend"><span class="kpi-delta flat">→ TOTAL CREADAS</span></div>
          </div>
          <div class="kpi">
            <div class="kpi-lbl">/02 — PRESUPUESTOS RECIBIDOS</div>
            <div class="kpi-val">${quotes.length}</div>
            <div class="kpi-trend"><span class="kpi-delta flat">→ ${pendingQuotes} PENDIENTES</span></div>
          </div>
          <div class="kpi">
            <div class="kpi-lbl">/03 — TRABAJOS EN CURSO</div>
            <div class="kpi-val">${reqs.filter(r => r.status === 'active').length}</div>
            <div class="kpi-trend"><span class="kpi-delta flat">→ PROFESIONAL ASIGNADO</span></div>
          </div>
          <div class="kpi">
            <div class="kpi-lbl">/04 — FINALIZADOS</div>
            <div class="kpi-val">${reqs.filter(r => r.status === 'done').length}</div>
            <div class="kpi-trend"><span class="kpi-delta flat">→ COMPLETADOS</span></div>
          </div>`;
      }
    }

    // Remover chart y citas hardcodeadas
    const overviewView = document.querySelector('[data-view="overview"]');
    const dashRows = overviewView?.querySelectorAll('.dash-row');
    if (dashRows) dashRows.forEach(row => row.remove());

    document.getElementById('profStat1').textContent = totalReqs;

    this._renderOverviewReqs();
  },

  _renderOverviewReqs(){
    const reqs = (this._cachedRequests || []).slice(0, 5);
    const cont = document.getElementById('overviewReqs');
    const isPro = this._isPro();

    if (!reqs.length){
      cont.innerHTML = `
        <div class="dash-empty" style="border:none">
          <div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg></div>
          <h3>${isPro ? 'Sin solicitudes disponibles' : 'Sin solicitudes aún'}</h3>
          <p>${isPro ? 'No hay solicitudes abiertas en este momento.' : 'Empezá creando tu primera solicitud de servicio.'}</p>
          ${!isPro ? '<button class="btn btn-primary" data-wizard-open data-dash-close>Solicitar servicio <span class="arrow"></span></button>' : ''}
        </div>`;
      if (!isPro) {
        cont.querySelector('[data-wizard-open]')?.addEventListener('click', () => {
          this.close();
          Wizard.open();
        });
      }
      return;
    }
    cont.innerHTML = reqs.map(r => this._reqRowHTML(r)).join('');
  },

  /* ========== REQUESTS VIEW ========== */

  _getRequests(){ return this._cachedRequests || []; },

  _renderRequests(query = ''){
    const filter = document.querySelector('[data-filter].active')?.dataset.filter || 'all';
    const reqs = this._getRequests().filter(r => {
      if (filter !== 'all'){
        if (filter === 'pending' && !['pending','quoted'].includes(r.status)) return false;
        if (filter === 'active' && r.status !== 'active') return false;
        if (filter === 'done' && r.status !== 'done') return false;
      }
      if (query){
        const q = query.toLowerCase();
        return r.ticketId.toLowerCase().includes(q)
            || (r.descripcion || '').toLowerCase().includes(q)
            || r.rubros.join(' ').toLowerCase().includes(q);
      }
      return true;
    });

    const cont = document.getElementById('allReqs');
    const badge = document.getElementById('dashReqsBadge');
    badge.textContent = this._getRequests().length;

    if (!reqs.length){
      cont.innerHTML = `
        <div class="dash-empty">
          <div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></svg></div>
          <h3>Sin resultados</h3>
          <p>No encontramos solicitudes con esos filtros.</p>
        </div>`;
      return;
    }
    cont.innerHTML = reqs.map(r => this._reqRowHTML(r)).join('');
  },

  _reqRowHTML(r){
    const rubros = r.rubros.map(rb => `<span class="rb">${RUBROS_LABELS[rb] || rb}</span>`).join('');
    const isPro = this._isPro();
    const quoteBtnHTML = isPro ? `
      <button onclick="Dashboard._showQuoteForm('${r.id}','${this._escape(r.ticketId)}','${this._escape((r.descripcion||'').substring(0,50))}')" 
        style="font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--orange);border:1px solid var(--orange-line);background:var(--orange-dim);padding:6px 12px;border-radius:2px;cursor:pointer;white-space:nowrap;transition:all .25s;"
        onmouseover="this.style.background='var(--orange)';this.style.color='#000'" 
        onmouseout="this.style.background='var(--orange-dim)';this.style.color='var(--orange)'">
        COTIZAR
      </button>` : '';

    return `
      <div class="req-row">
        <span class="req-id">#${r.ticketId}</span>
        <div class="req-info">
          <div class="title">${this._escape(r.descripcion)}</div>
          <div class="meta">
            <span>${TIPOS_LABELS[r.tipo] || r.tipo}</span>
            <span class="sep">/</span>
            <span>${this._escape(r.ciudad || '—')}</span>
            <span class="sep">/</span>
            <span>${this._formatDate(r.createdAt)}</span>
            ${r.clientName ? `<span class="sep">/</span><span>${this._escape(r.clientName)}</span>` : ''}
          </div>
        </div>
        <div class="req-rubros">${rubros}</div>
        ${quoteBtnHTML || `<span class="req-status ${r.status}">${this._statusLabel(r.status)}</span>`}
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
      </div>`;
  },

  /* ========== QUOTES VIEW ========== */

  _renderQuotesView(){
    const cont = document.querySelector('[data-view="quotes"]');
    if (!cont) return;

    if (this._isPro()) {
      const quotes = this._cachedMyQuotes || [];
      if (!quotes.length) {
        cont.innerHTML = `
          <div class="dash-empty">
            <div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></div>
            <h3>Sin presupuestos enviados</h3>
            <p>Explorá las solicitudes abiertas y enviá tu primer presupuesto.</p>
          </div>`;
        return;
      }
      cont.innerHTML = quotes.map(q => {
        const req = q.requests || {};
        const st = q.status === 'accepted' ? '<span class="req-status active">ACEPTADO</span>' 
                 : q.status === 'rejected' ? '<span class="req-status cancelled">RECHAZADO</span>'
                 : '<span class="req-status pending">PENDIENTE</span>';
        return `
          <div class="req-row">
            <span class="req-id">#${this._escape(req.ticket_id || '')}</span>
            <div class="req-info">
              <div class="title">$${Number(q.amount || 0).toLocaleString('es-AR')} — ${this._escape(q.description || '')}</div>
              <div class="meta">
                <span>${this._escape(req.ciudad || '')}</span>
                <span class="sep">/</span>
                <span>${this._formatDate(q.created_at)}</span>
              </div>
            </div>
            ${st}
          </div>`;
      }).join('');
    } else {
      const quotes = this._cachedClientQuotes || [];
      if (!quotes.length) {
        cont.innerHTML = `
          <div class="dash-empty">
            <div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></div>
            <h3>Sin presupuestos aún</h3>
            <p>Cuando los profesionales coticen tus solicitudes, vas a verlos acá.</p>
          </div>`;
        return;
      }
      cont.innerHTML = quotes.map(q => {
        const pro = q.profiles || {};
        const proInfo = q.professionals || {};
        const req = q.requests || {};
        const proName = `${pro.first_name || ''} ${pro.last_name || ''}`.trim() || 'Profesional';
        const proInitials = ((pro.first_name?.[0] || '') + (pro.last_name?.[0] || '')).toUpperCase() || 'PR';
        const features = q.features || [];
        const isAccepted = q.status === 'accepted';
        const isRejected = q.status === 'rejected';
        const isPending = q.status === 'pending';

        return `
          <div style="background:var(--bg-1);border:1px solid ${isAccepted ? 'var(--orange)' : 'var(--line)'};border-radius:var(--radius);padding:28px;margin-bottom:14px;position:relative;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
              <div style="display:flex;align-items:center;gap:14px;">
                <div style="width:48px;height:48px;border-radius:50%;background:var(--orange);color:#000;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;">${proInitials}</div>
                <div>
                  <div style="font-weight:700;font-size:16px;">${this._escape(proName)}</div>
                  <div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;">${this._escape(proInfo.rubro || '')} ${proInfo.rating ? '★ ' + Number(proInfo.rating).toFixed(1) : ''}</div>
                </div>
              </div>
              ${isAccepted ? '<span style="font-family:var(--mono);font-size:10px;color:var(--orange);letter-spacing:.12em;border:1px solid var(--orange-line);padding:4px 8px;border-radius:2px;">ACEPTADO</span>' 
              : isRejected ? '<span style="font-family:var(--mono);font-size:10px;color:#E54E10;letter-spacing:.12em;border:1px solid rgba(229,78,16,.3);padding:4px 8px;border-radius:2px;">RECHAZADO</span>'
              : ''}
            </div>
            <div style="font-family:var(--display);font-weight:800;font-size:32px;letter-spacing:-.02em;margin-bottom:4px;">$ ${Number(q.amount || 0).toLocaleString('es-AR')} <span style="font-size:14px;color:var(--muted);font-weight:400;">ARS</span></div>
            <div style="font-size:13px;color:var(--muted);margin-bottom:16px;">${this._escape(q.description || '')}</div>
            ${features.length ? `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:18px;">${features.map(f => `<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg>${this._escape(f)}</div>`).join('')}</div>` : ''}
            ${isPending ? `
              <div style="display:flex;gap:10px;margin-top:12px;">
                <button onclick="Dashboard._acceptQuote('${q.id}')" class="btn btn-primary" style="flex:1;">ACEPTAR →</button>
                <button onclick="Dashboard._rejectQuote('${q.id}')" class="btn btn-ghost" style="flex:1;">RECHAZAR</button>
              </div>` : ''}
            <div style="font-family:var(--mono);font-size:10px;color:var(--muted-2);letter-spacing:.1em;margin-top:12px;">SOLICITUD #${this._escape(req.ticket_id || '')} · ${this._escape(req.ciudad || '')}</div>
          </div>`;
      }).join('');
    }
  },

  async _acceptQuote(quoteId){
    try {
      const sb = window.supabase_client;
      const { error } = await sb.from('quotes').update({ status: 'accepted' }).eq('id', quoteId);
      if (error) throw error;

      const { data: quote } = await sb.from('quotes').select('request_id').eq('id', quoteId).single();
      if (quote) {
        await sb.from('quotes').update({ status: 'rejected' })
          .eq('request_id', quote.request_id).neq('id', quoteId).eq('status', 'pending');
        await sb.from('requests').update({ status: 'active' }).eq('id', quote.request_id);
      }

      toast('success', 'Presupuesto aceptado', 'El profesional fue notificado. ¡Éxitos con la obra!');
      this._cachedClientQuotes = await this._loadClientQuotes();
      this._cachedRequests = await this._loadRequests();
      this._renderQuotesView();
      this._renderRequests('');
      this._renderOverview();
    } catch(e){
      toast('error', 'Error', e.message || 'No se pudo aceptar el presupuesto.');
    }
  },

  async _rejectQuote(quoteId){
    try {
      const sb = window.supabase_client;
      const { error } = await sb.from('quotes').update({ status: 'rejected' }).eq('id', quoteId);
      if (error) throw error;

      toast('info', 'Presupuesto rechazado', 'Podés seguir recibiendo cotizaciones.');
      this._cachedClientQuotes = await this._loadClientQuotes();
      this._renderQuotesView();
    } catch(e){
      toast('error', 'Error', e.message || 'No se pudo rechazar el presupuesto.');
    }
  },

  /* ========== MESSAGES VIEW (próximamente) ========== */

  _renderMessagesView(){
    const cont = document.querySelector('[data-view="messages"]');
    if (!cont) return;
    cont.innerHTML = `
      <div class="dash-empty">
        <div class="ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square">
            <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>
          </svg>
        </div>
        <h3>Mensajes — próximamente</h3>
        <p>Estamos terminando el sistema de mensajería en tiempo real. Mientras tanto, podés contactar a los profesionales por WhatsApp desde la sección de presupuestos.</p>
        <div style="font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--muted-2);margin-top:12px;text-transform:uppercase;">MÓDULO EN DESARROLLO · V2.5</div>
      </div>`;
  },

  /* ========== PAYMENTS VIEW (próximamente) ========== */

  _renderPaymentsView(){
    const cont = document.querySelector('[data-view="payments"]');
    if (!cont) return;
    cont.innerHTML = `
      <div class="dash-empty">
        <div class="ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square">
            <rect x="2" y="6" width="20" height="14"/>
            <path d="M2 10h20M6 16h4"/>
          </svg>
        </div>
        <h3>Pagos — próximamente</h3>
        <p>La integración con Mercado Pago está en desarrollo. Pronto vas a poder pagar y cobrar directamente desde Brickø con total seguridad.</p>
        <div style="font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--muted-2);margin-top:12px;text-transform:uppercase;">INTEGRACIÓN MERCADO PAGO · V2.5</div>
      </div>`;
  },

  /* ========== QUOTE FORM (profesional) ========== */

  _showQuoteForm(requestId, ticketId, desc){
    document.getElementById('quoteFormOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'quoteFormOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px;';
    overlay.innerHTML = `
      <div style="background:var(--bg-1);border:1px solid var(--line-strong);border-radius:var(--radius);width:100%;max-width:520px;position:relative;overflow:hidden;">
        <div style="position:absolute;top:0;right:0;width:30px;height:30px;background:linear-gradient(225deg,var(--orange) 0%,var(--orange) 50%,transparent 50%);pointer-events:none;"></div>
        <div style="padding:24px 28px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;">
          <div style="font-family:var(--mono);font-size:10px;letter-spacing:.18em;color:var(--muted-2);text-transform:uppercase;display:flex;align-items:center;gap:10px;">
            <span style="width:6px;height:6px;border-radius:50%;background:var(--orange);box-shadow:0 0 8px var(--orange);"></span>
            NUEVO PRESUPUESTO
          </div>
          <button onclick="document.getElementById('quoteFormOverlay').remove()" style="width:30px;height:30px;border:1px solid var(--line-strong);border-radius:2px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;color:var(--ink);background:none;">✕</button>
        </div>
        <div style="padding:28px;">
          <div style="font-family:var(--display);font-weight:800;font-size:24px;letter-spacing:-.02em;text-transform:uppercase;margin-bottom:6px;">Enviar cotización</div>
          <div style="font-size:13px;color:var(--muted);margin-bottom:24px;">#${ticketId} · ${desc}...</div>
          <div style="margin-bottom:16px;">
            <label style="font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:8px;">MONTO (ARS) *</label>
            <input id="quoteAmount" type="number" placeholder="Ej: 35000" style="width:100%;background:var(--bg);border:1px solid var(--line-strong);border-radius:2px;padding:14px 16px;font-size:18px;color:var(--ink);font-family:var(--display);font-weight:700;outline:none;" />
          </div>
          <div style="margin-bottom:16px;">
            <label style="font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:8px;">DESCRIPCIÓN DEL TRABAJO *</label>
            <textarea id="quoteDesc" rows="3" placeholder="Materiales + mano de obra, qué incluye..." style="width:100%;background:var(--bg);border:1px solid var(--line-strong);border-radius:2px;padding:14px 16px;font-size:14px;color:var(--ink);outline:none;resize:vertical;font-family:var(--body);"></textarea>
          </div>
          <div style="margin-bottom:22px;">
            <label style="font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:8px;">CARACTERÍSTICAS (una por línea, opcional)</label>
            <textarea id="quoteFeatures" rows="3" placeholder="Visita en 24 horas\nGarantía 6 meses\n5 años de experiencia" style="width:100%;background:var(--bg);border:1px solid var(--line-strong);border-radius:2px;padding:14px 16px;font-size:13px;color:var(--ink);outline:none;resize:vertical;font-family:var(--body);"></textarea>
          </div>
          <button id="quoteSubmitBtn" onclick="Dashboard._submitQuote('${requestId}')" style="width:100%;padding:16px;background:var(--orange);color:#000;font-weight:700;font-size:13px;letter-spacing:.06em;text-transform:uppercase;border-radius:2px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:all .25s;">
            ENVIAR PRESUPUESTO →
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('quoteAmount').focus();
  },

  async _submitQuote(requestId){
    const amount = parseFloat(document.getElementById('quoteAmount').value);
    const description = document.getElementById('quoteDesc').value.trim();
    const featuresRaw = document.getElementById('quoteFeatures').value.trim();
    const features = featuresRaw ? featuresRaw.split('\n').filter(f => f.trim()) : [];

    if (!amount || amount <= 0) { toast('error', 'Monto requerido', 'Ingresá un monto válido.'); return; }
    if (!description) { toast('error', 'Descripción requerida', 'Describí qué incluye el trabajo.'); return; }

    const session = Auth.getSession();
    const btn = document.getElementById('quoteSubmitBtn');
    btn.style.pointerEvents = 'none';
    btn.textContent = 'ENVIANDO...';

    try {
      const sb = window.supabase_client;
      const { error } = await sb.from('quotes').insert({
        request_id: requestId,
        pro_id: session.userId,
        amount, description, features,
        status: 'pending'
      });
      if (error) throw error;

      await sb.from('requests').update({ status: 'quoted' }).eq('id', requestId).eq('status', 'pending');

      document.getElementById('quoteFormOverlay').remove();
      toast('success', 'Presupuesto enviado', 'El cliente recibirá tu cotización. ¡Éxitos!');

      this._cachedRequests = await this._loadOpenRequests();
      this._cachedMyQuotes = await this._loadProQuotes();
      this._renderRequests('');
      this._renderQuotesView();
      this._renderOverview();
    } catch(e){
      toast('error', 'Error al enviar', e.message || 'No se pudo enviar el presupuesto.');
      btn.style.pointerEvents = '';
      btn.textContent = 'ENVIAR PRESUPUESTO →';
    }
  },

  /* ========== PROFILE ========== */

  async _saveProfile(){
    const session = Auth.getSession();
    if (!session) return;

    const firstName = document.getElementById('profName').value.trim() || session.firstName;
    const lastName = document.getElementById('profLast').value.trim() || session.lastName;
    const email = document.getElementById('profEmail').value.trim() || session.email;
    const phone = document.getElementById('profPhone').value.trim() || session.phone;

    try {
      const sb = window.supabase_client;
      const { error } = await sb.from('profiles').update({
        first_name: firstName, last_name: lastName,
        phone: phone, updated_at: new Date().toISOString()
      }).eq('id', session.userId);

      if (error) { toast('error', 'Error al guardar', error.message); return; }

      const updated = { ...session, firstName, lastName, email, phone };
      try {
        const store = localStorage.getItem(Auth.STORAGE_KEY) ? localStorage : sessionStorage;
        store.setItem(Auth.STORAGE_KEY, JSON.stringify(updated));
      } catch(e){}

      Auth._render();
      this._renderAll();
      toast('success', 'Perfil actualizado', 'Tus datos se guardaron correctamente.');
    } catch(e){
      toast('error', 'Error de conexión', 'No se pudo conectar con el servidor.');
    }
  },

  /* ========== UTILS ========== */

  _statusLabel(s){
    return { pending:'PENDIENTE', quoted:'EN COTIZACIÓN', active:'EN CURSO', done:'FINALIZADA', cancelled:'CANCELADA' }[s] || (s||'').toUpperCase();
  },

  _formatDate(iso){
    try {
      const d = new Date(iso);
      const meses = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
      return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
    } catch(e){ return '—'; }
  },

  _escape(s){
    return String(s || '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  }
};

Dashboard.init();

// Drawer links → Dashboard views
document.querySelectorAll('.user-drawer a[href]').forEach(a => {
  const href = a.getAttribute('href');
  const map = {
    '#dashboard':'overview', '#solicitudes':'requests', '#presupuestos':'quotes',
    '#mensajes':'messages', '#pagos':'payments', '#perfil':'profile'
  };
  if (map[href]){
    a.addEventListener('click', (e) => {
      e.preventDefault();
      closeDrawer();
      Dashboard.open(map[href]);
    });
  }
});
