/* 10-coverage.js — Mapa de cobertura interactivo (ciudades AR) */

const Coverage = window.Coverage = {
  init(){
    const markers = document.querySelectorAll('.city-marker');
    const cards = document.querySelectorAll('.city-card');
    if (!markers.length) return;

    const setActive = (cityId) => {
      markers.forEach(m => m.classList.toggle('active', m.dataset.city === cityId));
      cards.forEach(c => c.classList.toggle('active', c.dataset.city === cityId));
      const mapId = document.getElementById('coverageMapId');
      if (mapId) mapId.textContent = 'MAPA / AR — ' + cityId.toUpperCase();
    };


    cards.forEach(c => {
      c.addEventListener('click', () => setActive(c.dataset.city));
      c.addEventListener('mouseenter', () => setActive(c.dataset.city));
    });

    // Pedir cobertura
    document.querySelectorAll('#coverageRequest, [data-coverage-request]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        toast('info', 'Sumá tu ciudad', 'Mándanos un WhatsApp con el nombre de tu ciudad y te avisamos cuando lleguemos.');
        // Abrir WhatsApp con template específico
        const text = 'Hola! Quería pedir que sumen mi ciudad a la cobertura de Brickø. Mi ciudad es:';
        const url = `https://wa.me/${WhatsApp.NUMBER}?text=${encodeURIComponent(text)}`;
        setTimeout(() => window.open(url, '_blank', 'noopener'), 600);
      });
    });
  }
};

Coverage.init();

// Mobile menu
