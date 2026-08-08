# Assets de la app móvil (Brickø)

Íconos y splash generados a partir del **logo de Brickø** (el cubo isométrico
del nav): cara superior naranja `#F25C18` sobre fondo carbón de marca.

## Archivos (fuente, 1024×1024 salvo splash)

| Archivo | Uso |
|---|---|
| `icon-only.png` | Ícono completo (iOS y Android legacy): fondo + cubo. |
| `icon-foreground.png` | Primer plano del **adaptive icon** de Android (cubo transparente, dentro de la safe-zone). |
| `icon-background.png` | Fondo del adaptive icon de Android. |
| `splash.png` (2732²) | Splash screen (tema claro). |
| `splash-dark.png` (2732²) | Splash screen (tema oscuro). |

Son los nombres y el layout que espera **`@capacitor/assets`**.

## Cómo generar los íconos nativos (Capacitor)

Desde la raíz del proyecto Capacitor (el que tiene las carpetas `android/` y/o
`ios/`). Si tu proyecto Capacitor es otro repo, copiá esta carpeta `assets/` a
la raíz de ese proyecto primero.

```bash
# 1) Instalar la herramienta (una sola vez)
npm install --save-dev @capacitor/assets

# 2) Generar todos los tamaños de ícono y splash hacia android/ e ios/
npx capacitor-assets generate \
  --iconBackgroundColor '#0A0A0A' \
  --iconBackgroundColorDark '#0A0A0A' \
  --splashBackgroundColor '#0A0A0A' \
  --splashBackgroundColorDark '#0A0A0A'

# 3) Sincronizar con las plataformas nativas
npx cap sync
```

Eso escribe automáticamente:
- **iOS**: `ios/App/App/Assets.xcassets/AppIcon.appiconset/…`
- **Android**: `android/app/src/main/res/mipmap-*/…` (incluye el adaptive icon
  con `ic_launcher_foreground` + `ic_launcher_background`) y los splash en
  `drawable-*`.

Después, recompilá:
```bash
npx cap open android   # o: npx cap open ios
```

## Regenerar los PNG fuente

Los PNG se rasterizaron desde el SVG del cubo. Si querés cambiar el diseño,
editá el script y volvé a correrlo (necesita Node + Playwright/Chromium):
`scripts/gen-app-icons.cjs` (incluido en el repo).

## Nota

Si tu proyecto Capacitor todavía no existe, el alta típica es:
```bash
npm install @capacitor/core @capacitor/cli
npx cap init "Brickø" "com.bricko.app" --web-dir .
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
```
(`--web-dir .` porque el sitio estático es la raíz de este repo.) Luego seguí
los pasos de generación de arriba.
