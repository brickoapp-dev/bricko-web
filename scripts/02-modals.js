/* 02-modals.js — Modales login/registro/reset y validación de formularios */

const modals = {
  login: document.getElementById('authLogin'),
  register: document.getElementById('authRegister'),
  reset: document.getElementById('authReset')
};
let lastFocused = null;

window.openModal = function openModal(name){
  Object.values(modals).forEach(m => m.classList.remove('open'));
  const m = modals[name];
  if (!m) return;
  lastFocused = document.activeElement;
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
  // foco al primer input
  setTimeout(() => m.querySelector('input,select,button')?.focus(), 100);
}
window.closeModals = function closeModals(){
  Object.values(modals).forEach(m => m.classList.remove('open'));
  document.body.style.overflow = '';
  lastFocused?.focus?.();
}

// Triggers para abrir
document.querySelectorAll('[data-auth-open]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(el.dataset.authOpen);
  });
});
// Cerrar
document.querySelectorAll('[data-auth-close]').forEach(el => {
  el.addEventListener('click', closeModals);
});
Object.values(modals).forEach(m => {
  m.addEventListener('click', (e) => { if (e.target === m) closeModals(); });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModals();
});

// Mostrar / ocultar password
document.querySelectorAll('[data-toggle-password]').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.togglePassword);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

// Role tabs (cliente / profesional)
let currentRole = 'cliente';
document.querySelectorAll('.auth-role-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-role-tab').forEach(x => x.classList.toggle('active', x === tab));
    currentRole = tab.dataset.role;
    const oficioField = document.getElementById('regOficioField');
    const regOficio = document.getElementById('regOficio');
    const pwIx = document.getElementById('regPwIx');
    if (currentRole === 'profesional'){
      oficioField.style.display = '';
      regOficio.required = true;
      pwIx.textContent = '/06';
    } else {
      oficioField.style.display = 'none';
      regOficio.required = false;
      regOficio.value = '';
      pwIx.textContent = '/05';
    }
  });
});

// Strength meter
const regPw = document.getElementById('regPassword');
const strengthEl = document.getElementById('regStrength');
function pwStrength(pw){
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
regPw?.addEventListener('input', () => {
  const s = pwStrength(regPw.value);
  strengthEl.className = 'strength s-' + s;
});

const EMAIL_RE = window.EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = window.PHONE_RE = /^[\d\s+()-]{8,}$/;

window.setFieldError = function setFieldError(input, msg){
  const field = input.closest('.field');
  if (!field) return;
  input.classList.add('error');
  field.classList.add('has-error');
  if (msg){
    const err = field.querySelector('.field-error');
    if (err) err.textContent = '⚠ ' + msg;
  }
}
window.clearFieldError = function clearFieldError(input){
  const field = input.closest('.field');
  if (!field) return;
  input.classList.remove('error');
  field.classList.remove('has-error');
}
// Limpiar errores al tipear
document.querySelectorAll('.field-input').forEach(inp => {
  inp.addEventListener('input', () => clearFieldError(inp));
});

// ---- LOGIN SUBMIT ----
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value.trim();
  const password = form.password.value;
  const remember = document.getElementById('loginRemember').checked;

  let ok = true;
  if (!EMAIL_RE.test(email)){ setFieldError(form.email, 'Email inválido'); ok = false; }
  if (password.length < 6){ setFieldError(form.password, 'Mínimo 6 caracteres'); ok = false; }
  if (!ok) return;

  const submit = form.querySelector('.auth-submit');
  submit.classList.add('loading');
  try {
    const user = await Auth.login({email, password, remember});
    toast('success', 'Sesión iniciada', `Hola de nuevo, ${user.firstName}.`);
    closeModals();
    form.reset();
  } catch(err){
    toast('error', 'No pudimos ingresar', err.message);
  } finally {
    submit.classList.remove('loading');
  }
});

// ---- REGISTER SUBMIT ----
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const firstName = form.firstName.value.trim();
  const lastName = form.lastName.value.trim();
  const email = form.email.value.trim();
  const phone = form.phone.value.trim();
  const password = form.password.value;
  const oficio = form.oficio.value;
  const terms = document.getElementById('regTerms').checked;

  let ok = true;
  if (firstName.length < 2){ setFieldError(form.firstName, 'Requerido'); ok = false; }
  if (lastName.length < 2){ setFieldError(form.lastName, 'Requerido'); ok = false; }
  if (!EMAIL_RE.test(email)){ setFieldError(form.email, 'Email inválido'); ok = false; }
  if (!PHONE_RE.test(phone)){ setFieldError(form.phone, 'Teléfono inválido'); ok = false; }
  if (pwStrength(password) < 2){ setFieldError(form.password, 'Contraseña muy débil'); ok = false; }
  if (currentRole === 'profesional' && !oficio){
    setFieldError(form.oficio, 'Seleccioná un oficio'); ok = false;
  }
  if (!terms){ toast('error', 'Falta aceptar', 'Tenés que aceptar los términos para continuar.'); ok = false; }
  if (!ok) return;

  const submit = form.querySelector('.auth-submit');
  submit.classList.add('loading');
  try {
    const user = await Auth.register({
      firstName, lastName, email, phone, password,
      role: currentRole,
      oficio: currentRole === 'profesional' ? oficio : null
    });
    toast('success', 'Cuenta creada', `Bienvenido a Brickø, ${user.firstName}.`);
    closeModals();
    form.reset();
    strengthEl.className = 'strength';
  } catch(err){
    toast('error', 'No pudimos crear la cuenta', err.message);
  } finally {
    submit.classList.remove('loading');
  }
});

// ---- RESET SUBMIT ----
document.getElementById('resetForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value.trim();
  if (!EMAIL_RE.test(email)){ setFieldError(form.email, 'Email inválido'); return; }

  const submit = form.querySelector('.auth-submit');
  submit.classList.add('loading');
  try {
    await Auth.resetPassword({email});
    toast('success', 'Revisá tu email', 'Si la cuenta existe, te enviamos un link para reiniciar la contraseña.');
    closeModals();
    form.reset();
  } catch(err){
    toast('error', 'Algo salió mal', err.message);
  } finally {
    submit.classList.remove('loading');
  }
});

// ---- Social buttons (placeholder) ----
document.querySelectorAll('[data-social]').forEach(btn => {
  btn.addEventListener('click', () => {
    toast('info', 'Próximamente', `Login con ${btn.dataset.social} disponible cuando conectemos el backend.`);
  });
});
