/* 04-wizard.js — Wizard 'Solicitar servicio' de 5 pasos */

const RUBROS_LABELS = window.RUBROS_LABELS = {
  plomeria: 'Plomería',
  gas: 'Gas',
  electricidad: 'Electricidad',
  albanileria: 'Albañilería',
  pintura: 'Pintura'
};
const TIPOS_LABELS = window.TIPOS_LABELS = {
  'refaccion': 'Refacción',
  'obra-nueva': 'Obra Nueva'
};
const URG_LABELS = window.URG_LABELS = {
  baja: 'Baja — Sin apuro',
  media: 'Media — Esta semana',
  alta: 'Alta — Urgente (horas)'
};

const Wizard = window.Wizard = {
  STORAGE_KEY: 'bricko-wizard-draft',
  state: {
    tipo: null,
    rubros: [],
    descripcion: '',
    photos: [],          // dataURLs
    direccion: '',
    ciudad: '',
    provincia: '',
    urgencia: null
  },
  current: 1,
  maxStep: 1,            // hasta dónde llegó

  init(){
    this.overlay = document.getElementById('wizard');
    this.bodyEl = this.overlay.querySelector('.wiz-body');
    this.foot = document.getElementById('wizFoot');
    this.backBtn = document.getElementById('wizBack');
    this.nextBtn = document.getElementById('wizNext');
    this.successEl = document.getElementById('wizSuccess');

    this._loadDraft();
    this._bindAll();
    this._renderState();
    this._renderProgress();
    this._updateNav();
  },

  open(startAt = null){
    this.overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (startAt) this.goTo(startAt);
    else this._renderState();
  },
  close(){
    this.overlay.classList.remove('open');
    document.body.style.overflow = '';
  },

  _bindAll(){
    // Cerrar
    document.getElementById('wizClose').addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.classList.contains('open')) this.close();
    });

    // Cards de tipo de proyecto
    document.querySelectorAll('[data-step="1"] .wiz-card').forEach(card => {
      card.addEventListener('click', () => {
        this.state.tipo = card.dataset.value;
        this._renderSelections();
        this._saveDraft();
        this._updateNav();
        this._updateSideContext();
      });
    });

    // Chips de rubros (multi)
    document.querySelectorAll('[data-step="2"] .wiz-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const v = chip.dataset.value;
        const idx = this.state.rubros.indexOf(v);
        if (idx >= 0) this.state.rubros.splice(idx, 1);
        else if (this.state.rubros.length < 5) this.state.rubros.push(v);
        this._renderSelections();
        this._saveDraft();
        this._updateNav();
        this._updateRubrosDiagram();
      });
    });

    // Urgencia
    document.querySelectorAll('[data-step="4"] .wiz-urg').forEach(u => {
      u.addEventListener('click', () => {
        this.state.urgencia = u.dataset.value;
        this._renderSelections();
        this._saveDraft();
        this._updateNav();
        // Actualizar ETA según urgencia
        const eta = u.dataset.value === 'alta' ? '4 <em>h</em>' :
                    u.dataset.value === 'media' ? '24 <em>h</em>' : '48 <em>h</em>';
        document.getElementById('etaTxt').innerHTML = eta;
      });
    });

    // Textarea descripción
    const desc = document.getElementById('wizDesc');
    desc.addEventListener('input', () => {
      let v = desc.value.slice(0, 500);
      if (desc.value !== v) desc.value = v;
      this.state.descripcion = v;
      document.getElementById('wizDescCount').textContent = v.length;
      this._updateNav();
      this._saveDraft();
      document.getElementById('ficha3'); // noop, evita unused
    });

    // Inputs de paso 4
    ['wizAddr','wizCity','wizProv'].forEach((id, i) => {
      const el = document.getElementById(id);
      const key = ['direccion','ciudad','provincia'][i];
      el.addEventListener('input', () => {
        this.state[key] = el.value;
        this._saveDraft();
        this._updateNav();
      });
    });

    // Uploader
    const fileInput = document.getElementById('wizFiles');
    fileInput.addEventListener('change', (e) => this._handleFiles(e.target.files));

    // Drag & drop
    const uploader = document.getElementById('wizUploader');
    ['dragenter','dragover'].forEach(ev => {
      uploader.addEventListener(ev, (e) => { e.preventDefault(); uploader.classList.add('drag'); });
    });
    ['dragleave','drop'].forEach(ev => {
      uploader.addEventListener(ev, (e) => { e.preventDefault(); uploader.classList.remove('drag'); });
    });
    uploader.addEventListener('drop', (e) => {
      e.preventDefault();
      this._handleFiles(e.dataTransfer.files);
    });

    // Nav buttons
    this.nextBtn.addEventListener('click', () => this._handleNext());
    this.backBtn.addEventListener('click', () => this.goTo(this.current - 1));

    // Step markers (saltar a pasos completados)
    document.querySelectorAll('.wiz-step-marker').forEach(m => {
      m.addEventListener('click', () => {
        const target = parseInt(m.dataset.go);
        if (target <= this.maxStep) this.goTo(target);
      });
    });

    // Botones "editar" en el resumen
    document.querySelectorAll('.wiz-summary-row .edit, .wiz-summary-row [data-go]').forEach(b => {
      b.addEventListener('click', () => this.goTo(parseInt(b.dataset.go)));
    });

    // Auth notice links
    document.getElementById('wizGoLogin').addEventListener('click', (e) => {
      e.preventDefault();
      this.close();
      openModal('login');
    });
    document.getElementById('wizGoRegister').addEventListener('click', (e) => {
      e.preventDefault();
      this.close();
      openModal('register');
    });

    // Success close
    document.getElementById('wizSuccessClose').addEventListener('click', () => {
      this.close();
      this._reset();
    });
  },

  _handleFiles(fileList){
    const files = Array.from(fileList);
    const slotsLeft = 6 - this.state.photos.length;
    const toLoad = files.slice(0, slotsLeft);
    if (files.length > slotsLeft){
      toast('info', 'Máximo 6 fotos', 'Se ignoraron las que sobraban.');
    }
    toLoad.forEach(file => {
      if (file.size > 5 * 1024 * 1024){
        toast('error', 'Archivo muy grande', `${file.name} supera los 5 MB.`);
        return;
      }
      if (!file.type.startsWith('image/')){
        toast('error', 'Formato inválido', `${file.name} no es una imagen.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        this.state.photos.push(e.target.result);
        this._renderPhotos();
        this._saveDraft();
        this._updateNav();
      };
      reader.readAsDataURL(file);
    });
  },

  _renderPhotos(){
    const cont = document.getElementById('wizPhotos');
    cont.innerHTML = '';
    this.state.photos.forEach((src, i) => {
      const ph = document.createElement('div');
      ph.className = 'wiz-photo';
      ph.innerHTML = `<img src="${src}" alt="Foto ${i+1}"><button type="button" class="rm" aria-label="Eliminar">✕</button>`;
      ph.querySelector('.rm').addEventListener('click', () => {
        this.state.photos.splice(i, 1);
        this._renderPhotos();
        this._saveDraft();
        this._updateNav();
      });
      cont.appendChild(ph);
    });
    document.getElementById('ficha3').textContent = this.state.photos.length;
  },

  _renderSelections(){
    // Tipo (paso 1)
    document.querySelectorAll('[data-step="1"] .wiz-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.value === this.state.tipo);
    });
    // Rubros (paso 2)
    document.querySelectorAll('[data-step="2"] .wiz-chip').forEach(c => {
      c.classList.toggle('selected', this.state.rubros.includes(c.dataset.value));
    });
    document.getElementById('rubrosCount').textContent = this.state.rubros.length;
    // Urgencia (paso 4)
    document.querySelectorAll('[data-step="4"] .wiz-urg').forEach(u => {
      u.classList.toggle('selected', u.dataset.value === this.state.urgencia);
    });

    // Ficha técnica lateral en paso 3
    document.getElementById('ficha1').textContent = this.state.tipo ? TIPOS_LABELS[this.state.tipo] : '—';
    const rubLabels = this.state.rubros.map(r => RUBROS_LABELS[r]).join(', ');
    document.getElementById('ficha2').textContent = rubLabels || '—';
    document.getElementById('ficha3').textContent = this.state.photos.length;
  },

  _renderState(){
    this._renderSelections();
    this._renderPhotos();

    // Pre-cargar valores en inputs
    document.getElementById('wizDesc').value = this.state.descripcion || '';
    document.getElementById('wizDescCount').textContent = (this.state.descripcion || '').length;
    document.getElementById('wizAddr').value = this.state.direccion || '';
    document.getElementById('wizCity').value = this.state.ciudad || '';
    document.getElementById('wizProv').value = this.state.provincia || '';
  },

  _updateRubrosDiagram(){
    const diag = document.getElementById('rubrosDiagram');
    // Limpiar líneas previas (mantener el círculo central)
    diag.innerHTML = '<circle cx="100" cy="100" r="40" />';
    const positions = {
      plomeria: [40, 50],
      gas: [160, 50],
      electricidad: [180, 130],
      albanileria: [100, 175],
      pintura: [20, 130]
    };
    this.state.rubros.forEach(r => {
      const [x, y] = positions[r];
      // Línea conectando al centro
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', 100); line.setAttribute('y1', 100);
      line.setAttribute('x2', x); line.setAttribute('y2', y);
      line.setAttribute('stroke', '#F25C18');
      line.setAttribute('stroke-width', '.7');
      line.setAttribute('stroke-dasharray', '2 2');
      diag.appendChild(line);
      // Nodo
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 6);
      c.setAttribute('fill', '#F25C18');
      diag.appendChild(c);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', x); t.setAttribute('y', y + 16);
      t.setAttribute('font-family', 'JetBrains Mono');
      t.setAttribute('font-size', '6');
      t.setAttribute('fill', '#F25C18');
      t.setAttribute('text-anchor', 'middle');
      t.textContent = RUBROS_LABELS[r].toUpperCase();
      diag.appendChild(t);
    });
  },

  _updateSideContext(){
    const t = this.state.tipo;
    if (t === 'refaccion'){
      document.getElementById('sideContext').textContent = 'CONTEXTO / REFACCIÓN';
    } else if (t === 'obra-nueva'){
      document.getElementById('sideContext').textContent = 'CONTEXTO / OBRA NUEVA';
    } else {
      document.getElementById('sideContext').textContent = 'CONTEXTO / 01';
    }
    // Ajustar lead del paso 2
    const lead = document.getElementById('rubrosLead');
    if (t === 'obra-nueva'){
      lead.textContent = 'En obra nueva podés sumar varios oficios. Coordinamos los gremios entre sí y los hitos de pago.';
    } else {
      lead.textContent = 'Elegí uno o varios oficios. Si no estás seguro, no te preocupes: el profesional puede sugerir otros si los detecta.';
    }
  },

  _canAdvance(fromStep){
    switch(fromStep){
      case 1: return !!this.state.tipo;
      case 2: return this.state.rubros.length > 0;
      case 3: return (this.state.descripcion || '').trim().length >= 20;
      case 4: return this.state.direccion.trim().length > 3
                  && this.state.ciudad.trim().length > 1
                  && this.state.provincia
                  && this.state.urgencia;
      case 5: return !!Auth.getSession();
    }
    return false;
  },

  _updateNav(){
    // Botón atrás
    this.backBtn.disabled = this.current === 1;
    // Botón siguiente
    const ok = this._canAdvance(this.current);
    this.nextBtn.disabled = !ok;
    // En el último paso, texto "Enviar solicitud"
    if (this.current === 5){
      this.nextBtn.innerHTML = 'Enviar solicitud <span class="arrow"></span>';
    } else {
      this.nextBtn.innerHTML = 'Siguiente <span class="arrow"></span>';
    }
    // Indicador del footer
    document.getElementById('wizCurStep').textContent = String(this.current).padStart(2, '0');

    // Mostrar/ocultar notice de login en paso 5
    const notice = document.getElementById('wizAuthNotice');
    if (this.current === 5){
      notice.style.display = Auth.getSession() ? 'none' : 'flex';
    }
  },

  _renderProgress(){
    document.querySelectorAll('.wiz-step-marker').forEach(m => {
      const n = parseInt(m.dataset.go);
      m.classList.remove('current','done');
      if (n < this.current) m.classList.add('done');
      else if (n === this.current) m.classList.add('current');
    });
  },

  goTo(step){
    if (step < 1 || step > 5) return;
    this.current = step;
    this.maxStep = Math.max(this.maxStep, step);
    document.querySelectorAll('.wiz-step').forEach(s => {
      s.classList.toggle('active', parseInt(s.dataset.step) === step);
    });
    this._renderProgress();
    this._updateNav();
    this.bodyEl.scrollTop = 0;
    if (step === 5) this._renderSummary();
  },

  _handleNext(){
    if (this.current < 5){
      if (!this._canAdvance(this.current)) return;
      this.goTo(this.current + 1);
    } else {
      // Submit
      if (!Auth.getSession()){
        toast('info', 'Necesitás una cuenta', 'Iniciá sesión o registrate para enviar la solicitud.');
        openModal('register');
        this.close();
        return;
      }
      this._submit();
    }
  },

  _renderSummary(){
    document.getElementById('sumTipo').textContent = this.state.tipo ? TIPOS_LABELS[this.state.tipo] : '—';

    const pills = document.getElementById('sumRubros');
    pills.innerHTML = '';
    if (this.state.rubros.length){
      this.state.rubros.forEach(r => {
        const p = document.createElement('span');
        p.className = 'wiz-summary-pill';
        p.textContent = RUBROS_LABELS[r];
        pills.appendChild(p);
      });
    } else {
      pills.innerHTML = '<span class="v muted">—</span>';
    }

    document.getElementById('sumDesc').textContent = this.state.descripcion || '—';

    const sp = document.getElementById('sumPhotos');
    sp.innerHTML = '';
    this.state.photos.forEach(src => {
      const d = document.createElement('div');
      d.style.backgroundImage = `url(${src})`;
      sp.appendChild(d);
    });
    if (!this.state.photos.length){
      sp.innerHTML = '<span style="font-family:var(--mono);font-size:10px;color:var(--muted-2);letter-spacing:.12em">SIN FOTOS</span>';
    }

    document.getElementById('sumLoc').textContent =
      [this.state.direccion, this.state.ciudad, this.state.provincia].filter(Boolean).join(', ') || '—';
    document.getElementById('sumUrg').textContent = this.state.urgencia ? URG_LABELS[this.state.urgencia] : '—';
  },

  async _submit(){
    this.nextBtn.classList.add('loading');

    const session = Auth.getSession();
    const ticketId = 'BX-' + new Date().getFullYear() + '-' + Math.floor(Math.random() * 9000 + 1000);

    try {
      const sb = window.supabase_client;
     const { error } = await sb.from('requests').insert({
        ticket_id: ticketId,
        user_id: session.userId,
        tipo: this.state.tipo,
        rubros: this.state.rubros,
        descripcion: this.state.descripcion,
        direccion: this.state.direccion,
        ciudad: this.state.ciudad,
        provincia: this.state.provincia,
        urgencia: this.state.urgencia,
        status: 'pending',
        fotos: this.state.photos.length > 0 ? this.state.photos : null
      });

      if (error) {
        toast('error', 'Error al enviar', error.message);
        this.nextBtn.classList.remove('loading');
        return;
      }
    } catch(e){
      toast('error', 'Error de conexión', 'No se pudo conectar con el servidor.');
      this.nextBtn.classList.remove('loading');
      return;
    }

    // Mostrar pantalla de éxito
    document.getElementById('wizTicketId').textContent = 'TICKET #' + ticketId;
    document.querySelectorAll('.wiz-step').forEach(s => s.classList.remove('active'));
    this.successEl.classList.add('show');
    this.foot.style.display = 'none';
    document.querySelector('.wiz-progress').style.display = 'none';
    this.nextBtn.classList.remove('loading');

    // Limpiar borrador
    try { localStorage.removeItem(this.STORAGE_KEY); } catch(e){}
  },

  _reset(){
    this.state = {
      tipo: null, rubros: [], descripcion: '', photos: [],
      direccion: '', ciudad: '', provincia: '', urgencia: null
    };
    this.current = 1; this.maxStep = 1;
    this.successEl.classList.remove('show');
    this.foot.style.display = '';
    document.querySelector('.wiz-progress').style.display = '';
    this._renderState();
    this._renderProgress();
    this._updateNav();
    this.goTo(1);
  },

  _saveDraft(){
    try {
      // Guardamos sin las fotos (pueden ser muy pesadas para localStorage)
      const draft = {...this.state};
      draft.photos = []; // omitir fotos en el borrador
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(draft));
    } catch(e){}
  },

  _loadDraft(){
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      Object.assign(this.state, draft);
    } catch(e){}
  }
};

Wizard.init();

// Triggers para abrir el wizard desde botones de la página
function bindWizardTrigger(){
  // Botón principal del hero
  document.querySelectorAll('a[href="#descargar"], a[href="#solicitar"]').forEach(a => {
    // Solo el primer botón del hero (no el de la sección CTA final que es para descargar la app)
  });
  // Bind explícito: cualquier elemento con [data-wizard-open]
  document.querySelectorAll('[data-wizard-open]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      Wizard.open();
    });
  });
}
bindWizardTrigger();
