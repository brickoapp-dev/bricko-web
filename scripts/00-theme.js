/* 00-theme.js — Toggle dark/light + anti-flash inicial */

// Anti-flash: aplica el tema guardado o según la hora del día ANTES de que pinte el DOM
(function(){
  try{
    var saved = localStorage.getItem('bricko-theme');
    var hour = new Date().getHours();
    var isDayTime = hour >= 7 && hour < 19;
    var defaultTheme = isDayTime ? 'light' : 'dark';
    var theme = saved || defaultTheme;
    document.documentElement.setAttribute('data-theme', theme);
  }catch(e){
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();



// Theme toggle
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;
themeToggle?.addEventListener('click', () => {
  const current = html.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  html.classList.add('theme-switching');
  html.setAttribute('data-theme', next);
  try { localStorage.setItem('bricko-theme', next); } catch(e) {}
  setTimeout(() => html.classList.remove('theme-switching'), 420);
});
