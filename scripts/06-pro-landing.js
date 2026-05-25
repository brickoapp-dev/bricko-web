/* 06-pro-landing.js — Landing para profesionales + calculadora interactiva */

const ProLanding = window.ProLanding = {
  overlay: null,
  init(){
    this.overlay = document.getElementById('proLanding');
    if (!this.overlay) return;

    // Triggers de apertura
    document.querySelectorAll('[data-pro-open]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.open();
      });
    });

    // Botones de retorno
    document.getElementById('proBackToClient')?.addEventListener('click', () => this.close());
    document.getElementById('proBackBottom')?.addEventListener('click', () => this.close());

    // Smooth scroll para los anchors internos
    this.overlay.querySelectorAll('a[href^="#pro-"]').forEach(a => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        const target = this.overlay.querySelector(id);
        if (target){
          e.preventDefault();
          this.overlay.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
        }
      });
    });

    // Calculadora
    this._initCalc();

    // Form
    this._initForm();
  },

  open(){
    this.overlay.classList.add('open');
    this.overlay.scrollTo({ top: 0 });
    document.body.style.overflow = 'hidden';
    window.scrollTo({ top: 0 });
  },

  close(){
    this.overlay.classList.remove('open');
    document.body.style.overflow = '';
  },

  /* ----- Calculadora ----- */
  _calc: {
    oficio:'plomeria',
    jobsPerWeek:5,
    ticket:18000,
    // ticket promedio por oficio
    ticketDefaults:{
      plomeria:18000, gas:22000, electricidad:20000,
      albanileria:16000, pintura:14000, varios:19000
    }
  },

  _initCalc(){
    // Tabs oficio
    this.overlay.querySelectorAll('#calcOficio .calc-select-opt').forEach(b => {
      b.addEventListener('click', () => {
        this.overlay.querySelectorAll('#calcOficio .calc-select-opt').forEach(x => x.classList.toggle('active', x === b));
        this._calc.oficio = b.dataset.value;
        // Actualizar ticket promedio
        const newTicket = this._calc.ticketDefaults[b.dataset.value] || 18000;
        this._calc.ticket = newTicket;
        const tInput = document.getElementById('calcTicket');
        if (tInput) tInput.value = newTicket;
        this._renderCalc();
      });
    });

    // Slider jobs
    const jobsSlider = document.getElementById('calcJobs');
    jobsSlider?.addEventListener('input', (e) => {
      this._calc.jobsPerWeek = parseInt(e.target.value);
      this._renderCalc();
    });

    // Slider ticket
    const ticketSlider = document.getElementById('calcTicket');
    ticketSlider?.addEventListener('input', (e) => {
      this._calc.ticket = parseInt(e.target.value);
      this._renderCalc();
    });

    this._renderCalc();
  },

  _renderCalc(){
    const { jobsPerWeek, ticket } = this._calc;
    const jobsMonth = jobsPerWeek * 4;
    const gross = jobsMonth * ticket;
    const fee = gross * 0.15;
    const net = gross - fee;
    const year = net * 12;

    const fmt = n => n.toLocaleString('es-AR', { maximumFractionDigits: 0 });

    const $ = id => document.getElementById(id);
    if ($('calcJobsVal')) $('calcJobsVal').textContent = jobsPerWeek;
    if ($('calcTicketVal')) $('calcTicketVal').textContent = '$ ' + fmt(ticket);
    if ($('calcAmount')) $('calcAmount').textContent = fmt(net);
    if ($('calcGross')) $('calcGross').textContent = '$ ' + fmt(gross);
    if ($('calcFee')) $('calcFee').textContent = '$ ' + fmt(fee);
    if ($('calcJobsTotal')) $('calcJobsTotal').textContent = jobsMonth;
    if ($('calcYear')) $('calcYear').textContent = '$ ' + fmt(year);
  },

  /* ----- Form de alta pro ----- */
  _initForm(){
    const form = document.getElementById('proForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        firstName: form.firstName?.value.trim() || '',
        lastName: form.lastName?.value.trim() || '',
        email: form.email?.value.trim() || '',
        phone: form.phone?.value.trim() || '',
        oficio: form.oficio?.value || '',
        city: form.city?.value.trim() || '',
        years: form.years?.value || ''
      };

      let ok = true;
      if (data.firstName.length < 2){ setFieldError(form.firstName, 'Requerido'); ok = false; }
      if (data.lastName.length < 2){ setFieldError(form.lastName, 'Requerido'); ok = false; }
      if (!EMAIL_RE.test(data.email)){ setFieldError(form.email, 'Email inválido'); ok = false; }
      if (!PHONE_RE.test(data.phone)){ setFieldError(form.phone, 'Teléfono inválido'); ok = false; }
      if (!data.oficio){ setFieldError(form.oficio, 'Seleccioná un oficio'); ok = false; }
      if (data.city.length < 2){ setFieldError(form.city, 'Requerido'); ok = false; }
      if (!document.getElementById('proTerms').checked){
        toast('error', 'Falta aceptar', 'Tenés que aceptar los términos para profesionales.');
        ok = false;
      }
      if (!ok) return;

      const submit = form.querySelector('.auth-submit');
      submit?.classList.add('loading');

      try {
        const sb = window.supabase_client;
        const { error } = await sb.from('pro_applications').insert({
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email,
          phone: data.phone,
          oficio: data.oficio,
          city: data.city,
          years_experience: data.years ? parseInt(data.years) : null
        });

        submit?.classList.remove('loading');

        if (error) {
          // Si la tabla no existe, guardar localmente como fallback
          console.warn('Supabase pro_applications error:', error.message);
          try {
            const apps = JSON.parse(localStorage.getItem('bricko-pro-applications') || '[]');
            apps.push({ ...data, id: 'pro_' + Date.now().toString(36), createdAt: new Date().toISOString() });
            localStorage.setItem('bricko-pro-applications', JSON.stringify(apps));
          } catch(e){}
        }
      } catch(e){
        submit?.classList.remove('loading');
        console.warn('Error en pro form:', e);
      }
      toast('success', 'Solicitud enviada', `Gracias ${data.firstName}, un coordinador te contacta en 48h por email o teléfono.`);
      form.reset();
      // Volver arriba para que vea el éxito
      this.overlay.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Limpiar errores al tipear (reutiliza la lógica del auth)
    form.querySelectorAll('.field-input').forEach(inp => {
      inp.addEventListener('input', () => clearFieldError(inp));
    });
  }
};

ProLanding.init();
