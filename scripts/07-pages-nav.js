/* 07-pages-nav.js — Navegador de páginas legales/secundarias */

const PagesNav = window.PagesNav = {
  pages: ['terms','privacy','cookies','about','careers','press'],
  current: null,

  init(){
    // Triggers de apertura: cualquier elemento con [data-page-open="<id>"]
    document.querySelectorAll('[data-page-open]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.open(el.dataset.pageOpen);
      });
    });

    // Botones de retorno
    document.querySelectorAll('[data-page-back]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.close();
      });
    });

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.current){
        this.close();
      }
    });

    // Scroll suave para enlaces internos del TOC
    this.pages.forEach(p => {
      const overlay = document.getElementById('page-' + p);
      if (!overlay) return;
      overlay.querySelectorAll('.legal-toc a').forEach(a => {
        a.addEventListener('click', (e) => {
          const id = a.getAttribute('href');
          const target = overlay.querySelector(id);
          if (target){
            e.preventDefault();
            overlay.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
          }
        });
      });

      // Observer para resaltar sección activa en el TOC
      const tocLinks = overlay.querySelectorAll('.legal-toc a');
      const sections = overlay.querySelectorAll('.legal-section[id]');
      if (sections.length && tocLinks.length){
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting){
              const id = entry.target.id;
              tocLinks.forEach(l => {
                l.classList.toggle('active', l.getAttribute('href') === '#' + id);
              });
            }
          });
        }, { root: overlay, rootMargin: '-80px 0px -60% 0px', threshold: 0 });
        sections.forEach(s => observer.observe(s));
      }
    });
  },

  open(pageId){
    if (!this.pages.includes(pageId)) return;
    // Cerrar cualquier otro modal/overlay activo
    closeModals?.();
    try { closeDrawer?.(); } catch(e){}
    Dashboard?.close?.();
    ProLanding?.close?.();
    try { Wizard?.close?.(); } catch(e){}

    const overlay = document.getElementById('page-' + pageId);
    if (!overlay) return;

    // Cerrar la página anterior si había
    if (this.current){
      document.getElementById('page-' + this.current)?.classList.remove('open');
    }

    overlay.classList.add('open');
    overlay.scrollTo({ top: 0 });
    document.body.style.overflow = 'hidden';
    this.current = pageId;
    // Scroll del documento a top para evitar que se vea contenido detrás
    window.scrollTo({ top: 0 });
  },

  close(){
    if (this.current){
      document.getElementById('page-' + this.current)?.classList.remove('open');
      this.current = null;
    }
    document.body.style.overflow = '';
  }
};

PagesNav.init();
