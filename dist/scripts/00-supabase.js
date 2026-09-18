/* 00-supabase.js — Inicialización del cliente Supabase */

const SUPABASE_URL = 'https://wkyqetwyswocrohayiss.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndreXFldHd5c3dvY3JvaGF5aXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMTUyMzQsImV4cCI6MjA5NDc5MTIzNH0.W0msddSTRWrh2d7EMVJ02qTp6uT8FIOET1DkqXnsRl4';

// createClient() persiste el token de sesión en localStorage por defecto,
// sin importar el checkbox "mantener sesión" del login: si no se lo
// redirige a sessionStorage a mano, la sesión sobrevive a cerrar el
// navegador igual y Auth.init() vuelve a loguear solo la próxima vez.
// BRICKO_REMEMBER_KEY guarda la elección del usuario para que este storage
// adapter sepa a cuál de los dos escribir.
window.BRICKO_REMEMBER_KEY = 'bricko-remember-me';

const brickoAuthStorage = {
  getItem(key) {
    try { return localStorage.getItem(key) ?? sessionStorage.getItem(key); }
    catch (e) { return null; }
  },
  setItem(key, value) {
    let remembered = true;
    try { remembered = localStorage.getItem(window.BRICKO_REMEMBER_KEY) !== '0'; } catch (e) {}
    try {
      const store = remembered ? localStorage : sessionStorage;
      const other = remembered ? sessionStorage : localStorage;
      store.setItem(key, value);
      other.removeItem(key);
    } catch (e) {}
  },
  removeItem(key) {
    try { localStorage.removeItem(key); } catch (e) {}
    try { sessionStorage.removeItem(key); } catch (e) {}
  }
};

window.supabase_client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: brickoAuthStorage }
});