/* 02b-drawer.js — User drawer lateral (menú del usuario logueado) */

const userChip = document.getElementById('userChip');
const userDrawer = document.getElementById('userDrawer');
const userDrawerOverlay = document.getElementById('userDrawerOverlay');
const drawerClose = document.getElementById('drawerClose');

window.openDrawer = function openDrawer(){
  userDrawer.classList.add('open');
  userDrawerOverlay.classList.add('open');
  userChip.setAttribute('aria-expanded', 'true');
  userDrawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
window.closeDrawer = function closeDrawer(){
  userDrawer.classList.remove('open');
  userDrawerOverlay.classList.remove('open');
  userChip.setAttribute('aria-expanded', 'false');
  userDrawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

userChip?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (userDrawer.classList.contains('open')) closeDrawer();
  else openDrawer();
});
drawerClose?.addEventListener('click', closeDrawer);
userDrawerOverlay?.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && userDrawer.classList.contains('open')) closeDrawer();
});
// Cualquier elemento con data-drawer-close cierra el drawer
document.querySelectorAll('[data-drawer-close]').forEach(el => {
  el.addEventListener('click', () => closeDrawer());
});

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  Auth.logout();
  closeDrawer();
  toast('info', 'Sesión cerrada', 'Hasta la próxima.');
});
