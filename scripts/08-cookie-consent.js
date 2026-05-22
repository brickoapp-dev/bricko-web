/* 08-cookie-consent.js — Banner de consentimiento de cookies + preferencias */

const CookieConsent = window.CookieConsent = {
  STORAGE_KEY: 'bricko-consent',
  DEFAULTS: { essential: true, analytics: false, marketing: false, version: '2.4', timestamp: null },

  init(){
    this.banner = document.getElementById('cookieBanner');
    this.prefs = document.getElementById('cookiePrefs');

    // Mostrar banner si no hay consentimiento guardado
    const saved = this._load();
    if (!saved){
      // Pequeño delay para que aparezca después de que cargue la página
      setTimeout(() => this.banner.classList.add('show'), 800);
    }

    // Botones de acción
    document.querySelectorAll('[data-cookie-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.cookieAction;
        if (action === 'accept') this._save({ essential: true, analytics: true, marketing: true });
        else if (action === 'reject') this._save({ essential: true, analytics: false, marketing: false });
        else if (action === 'prefs') this._togglePrefs();
      });
    });

    // Switches individuales
    this.prefs.querySelectorAll('.cookie-switch:not(.locked)').forEach(sw => {
      const toggle = () => {
        sw.classList.toggle('on');
        sw.setAttribute('aria-checked', sw.classList.contains('on') ? 'true' : 'false');
        // Guardar preferencias actuales
        const current = {
          essential: true,
          analytics: document.getElementById('prefAnalytics').classList.contains('on'),
          marketing: document.getElementById('prefMarketing').classList.contains('on')
        };
        this._save(current, /* keepOpen */ true);
      };
      sw.addEventListener('click', toggle);
      sw.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter'){
          e.preventDefault();
          toggle();
        }
      });
    });

    // Trigger desde la política de cookies o desde otros lados
    document.querySelectorAll('[data-cookie-prefs]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.show();
        this._togglePrefs(true);
      });
    });
  },

  _load(){
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch(e){ return null; }
  },

  _save(prefs, keepOpen = false){
    const data = {
      ...this.DEFAULTS,
      ...prefs,
      timestamp: new Date().toISOString()
    };
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data)); } catch(e){}
    if (!keepOpen){
      this.banner.classList.remove('show');
      toast('success', 'Preferencias guardadas', 'Podés cambiarlas cuando quieras desde la Política de Cookies.');
    }
    // Activar/desactivar tracking acá iría la llamada real a GA / Meta
    // TODO: Si analytics === true, cargar gtag.js
    // TODO: Si marketing === true, cargar Meta Pixel
  },

  _togglePrefs(force){
    const willOpen = force === true || !this.prefs.classList.contains('open');
    this.prefs.classList.toggle('open', willOpen);
  },

  show(){
    this.banner.classList.add('show');
  }
};

CookieConsent.init();
