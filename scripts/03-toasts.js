/* 03-toasts.js — Sistema de notificaciones flotantes (toasts) */

const ICONS = window.ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>'
};
window.toast = function toast(type, title, message){
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `
    <div class="ic">${ICONS[type] || ICONS.info}</div>
    <div class="toast-body">
      <div class="t">${title}</div>
      <div class="m">${message}</div>
    </div>
  `;
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 350);
  }, 4500);
}
