# Brickø — Sitio web

Marketplace de servicios de construcción en Argentina. Conecta clientes que necesitan refacciones u obras nuevas con plomeros, gasistas, electricistas, albañiles, pintores, carpinteros, herreros y jardineros verificados.

**Producción:** [brickø.com](https://xn--brick-zua.com) — deploy automático vía GitHub Pages desde `main`.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | HTML/CSS/JS vanilla (sin frameworks ni build step) |
| Backend | [Supabase](https://supabase.com) (Auth + Postgres + RLS) |
| Hosting | GitHub Pages (sitio estático) |
| DNS | Hostinger → GitHub Pages |

## Cómo correrlo en local

**Opción A — Live Server de VS Code (recomendado)**
1. Abrir esta carpeta en VS Code
2. Click derecho en `index.html` → "Open with Live Server"

**Opción B — Cualquier servidor estático**
```bash
# Con Python
python3 -m http.server 8000
# o con Node
npx serve .
```
Luego abrir `http://localhost:8000`

**No funciona con doble click** (file://) porque el navegador bloquea los módulos externos. Usá un servidor local.

> El sitio en local pega contra el **mismo Supabase de producción**. Cuidado con los datos de prueba.

## Arquitectura

Cada vista es una página HTML independiente que carga solo los scripts y estilos que necesita. No hay overlays ni wizard inline: la navegación es entre páginas reales.

```
brickø web/
├── index.html                  Landing + modales de login/registro (CSS y JS propios inline)
├── client.html                 Dashboard del cliente (mis solicitudes, presupuestos)
├── pro.html                    Dashboard del profesional (feed de solicitudes, cotizar)
├── solicitud-refaccion.html    Formulario de solicitud de refacción
├── solicitud-obra.html         Formulario de solicitud de obra nueva
├── pro-presupuesto.html        Prototipo standalone (demo con datos hardcodeados, NO conectado)
├── CNAME                       Dominio custom (xn--brick-zua.com)
├── scripts/
│   ├── supabase.min.js         SDK de Supabase
│   ├── 00-supabase.js          Inicialización del cliente (window.supabase_client)
│   ├── 01-auth.js              Auth real: registro, login, logout, restore de sesión, redirect por rol
│   ├── client-dashboard.js     Lógica de client.html
│   ├── pro-dashboard.js        Lógica de pro.html
│   └── request-form.js         Lógica compartida de los dos formularios de solicitud
└── styles/
    ├── client-dashboard.css    Estilos de client.html (incluye su propio design system)
    ├── pro-dashboard.css       Estilos de pro.html (ídem)
    └── request-form.css        Estilos de los formularios (ídem)
```

### Qué carga cada página

| Página | Scripts | CSS |
|---|---|---|
| index.html | supabase.min + 00-supabase + 01-auth + inline | inline |
| client.html | supabase.min + 00-supabase + 01-auth + client-dashboard | client-dashboard.css |
| pro.html | supabase.min + 00-supabase + 01-auth + pro-dashboard | pro-dashboard.css |
| solicitud-*.html | supabase.min + 00-supabase + 01-auth + request-form | request-form.css |
| pro-presupuesto.html | — (todo inline, demo) | inline |

Cada CSS define sus propias variables en `:root` — son autosuficientes, no dependen entre sí.

## Flujo principal

1. **Cliente** se registra en index → redirect automático a `client.html`
2. Elige Refacción u Obra Nueva → completa el formulario → la solicitud se inserta en Supabase con status `pending`
3. **Profesional** ve la solicitud en su feed (`pro.html`) → envía presupuesto → la solicitud pasa a `quoted`
4. El cliente ve el presupuesto en el detalle de su solicitud → lo acepta → la solicitud pasa a `active` y los demás presupuestos se rechazan automáticamente

## Datos (Supabase)

### Tablas

- **profiles** — `id, first_name, last_name, phone, role, city`
- **professionals** — `id, rubro, years_experience, verified, rating, jobs_completed, bio`
- **requests** — `id (UUID), user_id, ticket_id, tipo, rubros[], titulo, descripcion, urgencia, direccion, status, etapa, tipo_construccion, superficie, created_at`
- **quotes** — `id, request_id, pro_id, amount, description, features[], status, created_at`

### Convenciones

- **Status en inglés en la DB**, mapeado a español en el JS:
  `pending` → Pendiente · `quoted` → Cotizando · `active` → En curso · `done` → Finalizada · `cancelled` → Cancelada
- **tipo**: `refaccion` | `obra-nueva` (la UI dice "Obra" pero la DB guarda `obra-nueva`)
- **urgencia**: `baja` | `media` | `alta`
- **role**: `cliente` | `profesional`
- El **título** de la solicitud se genera automáticamente desde los rubros (refacción) o el tipo de construcción (obra)

### Sesión (localStorage / sessionStorage)

- `bricko-session` — sesión completa: `{userId, email, firstName, lastName, role, oficio, loggedAt}`
- `bricko-user` — versión simple: `{id, name, email, role}`

`01-auth.js` guarda ambas al loguear y las limpia al desloguear. Las páginas internas leen `bricko-session` para la protección de página: sin sesión → redirect a index; rol equivocado → redirect al dashboard correcto.

## Roadmap

- [ ] Conectar `pro-presupuesto.html` a Supabase (hoy es demo standalone)
- [ ] Subir fotos de solicitudes a Supabase Storage (hoy solo preview local)
- [ ] Integrar Mercado Pago (frontend JS + Supabase Edge Functions para webhooks)
- [ ] Comprar `bricko.com` como fallback del dominio (la `ø` aparece como punycode al compartir links)
- [ ] Revisar features de la landing vieja que quedaron afuera (banner de cookies, WhatsApp flotante, páginas legales, mapa de cobertura) — decidir si vuelven y reescribirlas contra el HTML nuevo

## Historia

La versión anterior era un `index.html` monolítico de ~4.400 líneas con el wizard y el dashboard como overlays, y persistencia en localStorage (modo demo). Esa arquitectura se reemplazó por completo en junio 2026 por páginas separadas + Supabase real. Los archivos viejos (`04-wizard.js`, `05-dashboard.js`, CSS por sección, etc.) se eliminaron — están disponibles en el historial de Git si hace falta consultarlos.
