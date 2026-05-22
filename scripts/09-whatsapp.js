/* 09-whatsapp.js — Botón flotante de WhatsApp + menú de contactos */

const WhatsApp = window.WhatsApp = {
  NUMBER: '5491155001974',
  TEMPLATES: {
    general: 'Hola Brickø! Quería hacer una consulta general sobre la plataforma.',
    urgencia: 'Hola! Tengo una urgencia y necesito un profesional cuanto antes. Te cuento:',
    'obra-nueva': 'Hola Brickø! Estoy planificando una obra nueva / reforma grande y me gustaría coordinar una cotización.',
    profesional: 'Hola! Soy del oficio y quiero sumarme a Brickø como profesional. Mi rubro es:',
    reclamo: 'Hola, tengo un reclamo sobre un trabajo realizado a través de Brickø. El número de ticket es:'
  },

  init(){
    this.trigger = document.getElementById('waTrigger');
    this.menu = document.getElementById('waMenu');
    if (!this.trigger) return;

    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Cerrar al click fuera
    document.addEventListener('click', (e) => {
      if (!this.menu.contains(e.target) && !this.trigger.contains(e.target)){
        this.close();
      }
    });

    // Cerrar con ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.menu.classList.contains('open')) this.close();
    });

    // Opciones
    this.menu.querySelectorAll('[data-wa]').forEach(opt => {
      opt.addEventListener('click', () => {
        const type = opt.dataset.wa;
        const text = this.TEMPLATES[type] || this.TEMPLATES.general;
        const url = `https://wa.me/${this.NUMBER}?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'noopener');
        this.close();
      });
    });
  },

  toggle(){
    if (this.menu.classList.contains('open')) this.close();
    else this.open();
  },
  open(){
    this.menu.classList.add('open');
    this.trigger.setAttribute('aria-expanded', 'true');
  },
  close(){
    this.menu.classList.remove('open');
    this.trigger.setAttribute('aria-expanded', 'false');
  }
};

WhatsApp.init();
