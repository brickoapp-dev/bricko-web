# Brickø — Sitio web

Plataforma de servicios de construcción. Conecta usuarios con plomeros, gasistas, electricistas, albañiles y pintores verificados.

## Cómo abrirlo

**Opción A — Live Server de VS Code (recomendado)**
1. Abrir esta carpeta en VS Code
2. Click derecho en `index.html` → "Open with Live Server"
3. Listo

**Opción B — Cualquier servidor estático**
```bash
# Con Python
python3 -m http.server 8000
# o con Node
npx serve .
```
Luego abrir `http://localhost:8000`

**No funciona con doble click** (file://) porque algunos navegadores bloquean cargar CSS/JS externos. Usá un servidor local.

## Estructura

```
brickø/
├── index.html          ← HTML principal (estructura del sitio)
├── styles/             ← Hojas de estilo, una por sección
│   ├── 00-base.css           Variables, tipografía, grid, animaciones globales
│   ├── 01-nav.css            Topbar y navegación principal
│   ├── 02-hero.css           Hero + ticker
│   ├── 03-sections.css       Secciones de la home (Cómo funciona, Servicios, etc.)
│   ├── 04-footer.css         Footer
│   ├── 05-auth.css           Modales login/registro/reset
│   ├── 06-wizard.css         Wizard "Solicitar servicio"
│   ├── 07-drawer.css         User chip + drawer lateral
│   ├── 08-dashboard.css      Dashboard del cliente
│   ├── 09-pro-landing.css    Landing para profesionales
│   ├── 10-pages.css          Páginas legales y secundarias
│   ├── 11-cookie-banner.css  Banner de cookies
│   ├── 12-whatsapp.css       WhatsApp flotante
│   └── 13-coverage.css       Mapa de cobertura
└── scripts/            ← JavaScript, también modular
    ├── 00-theme.js              Toggle dark/light + anti-flash
    ├── 01-auth.js               Sistema de autenticación (modo demo)
    ├── 02-modals.js             Modales de login/registro/reset
    ├── 02b-drawer.js            User drawer lateral
    ├── 03-toasts.js             Sistema de toasts
    ├── 04-wizard.js             Wizard de solicitud
    ├── 05-dashboard.js          Dashboard
    ├── 06-pro-landing.js        Landing pro + calculadora
    ├── 07-pages-nav.js          Navegador entre páginas legales
    ├── 08-cookie-consent.js     Banner cookies
    ├── 09-whatsapp.js           WhatsApp flotante
    ├── 10-coverage.js           Mapa de cobertura
    └── 11-misc.js               Mobile menu, scroll reveal, etc.
```

## Cómo editar

### Cambiar un color global (naranja, fondo, etc.)
→ `styles/00-base.css`. Las variables CSS están al principio en `:root` y `[data-theme="light"]`.

### Tocar una sección específica
→ Ir al archivo CSS que corresponda. Cada archivo tiene un comentario inicial explicando qué contiene.

### Cambiar comportamiento de algún componente
→ Ir al JS correspondiente. Por ejemplo, el wizard está en `scripts/04-wizard.js`.

### Conectar el backend real
Los archivos que tienen llamadas mock (modo demo) tienen comentarios `// TODO BACKEND` donde cambiar:
- `scripts/01-auth.js` — registro, login, reset password
- `scripts/04-wizard.js` — envío de solicitud (método `_submit`)
- `scripts/05-dashboard.js` — carga de solicitudes del usuario
- `scripts/06-pro-landing.js` — alta de profesionales

## Orden de carga del JavaScript

El orden importa porque algunos archivos exponen funciones que otros usan vía `window.X`:

1. `00-theme.js` — autónomo
2. `01-auth.js` — expone `window.Auth`
3. `03-toasts.js` — expone `window.toast`
4. `02b-drawer.js` — expone `window.openDrawer`, `window.closeDrawer`
5. `02-modals.js` — expone `window.openModal`, `window.closeModals`, `window.setFieldError`, `window.clearFieldError`
6. `04-wizard.js` — usa `Auth`, `toast`, `openModal`, expone `window.Wizard`
7. `05-dashboard.js` — usa `Auth`, `toast`, expone `window.Dashboard`
8. `06-pro-landing.js` — expone `window.ProLanding`
9. `07-pages-nav.js` — expone `window.PagesNav`
10. `08-cookie-consent.js` — expone `window.CookieConsent`
11. `09-whatsapp.js` — expone `window.WhatsApp`
12. `10-coverage.js` — expone `window.Coverage`
13. `11-misc.js` — varias utilidades sueltas

Si querés reordenar, hay que respetar las dependencias.

## Tests

Para el testing automatizado (E2E con Playwright), mirá los archivos en `/tmp/e2e.js` del entorno de desarrollo. El sitio pasa **28/28 tests** sin errores de consola.

## Tema oscuro/claro

El sitio detecta `prefers-color-scheme` del sistema en la primera visita, guarda la elección del usuario en `localStorage` bajo la clave `bricko-theme`. Hay un script anti-flash en `<head>` que aplica el tema antes del primer render.

## Persistencia local (modo demo)

Mientras no haya backend, el sitio usa `localStorage` para:
- `bricko-session` — sesión actual del usuario
- `bricko-users-demo` — usuarios "registrados"
- `bricko-requests` — solicitudes enviadas
- `bricko-wizard-draft` — borrador del wizard
- `bricko-theme` — preferencia de tema
- `bricko-consent` — consentimiento de cookies
- `bricko-pro-applications` — postulaciones de profesionales

Todo esto se reemplaza por llamadas al backend cuando se conecte.
