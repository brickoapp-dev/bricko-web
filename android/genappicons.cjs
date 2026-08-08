/* gen-app-icons.cjs — Genera los assets de la app móvil (íconos + splash) a
   partir del logo de Brickø (el cubo isométrico), rasterizando SVG con
   Playwright/Chromium.

   Uso:
     npm i -D playwright   # (o tener playwright disponible)
     node scripts/gen-app-icons.cjs

   Escribe en ./assets: icon-only.png, icon-foreground.png, icon-background.png,
   splash.png, splash-dark.png. Después usar @capacitor/assets (ver assets/README.md). */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(process.cwd(), 'assets');
fs.mkdirSync(OUT, { recursive: true });

// Cubo isométrico de Brickø (mismo del nav). viewBox 24; cubo (2,2)-(22,22).
const CUBE = `
  <path d="M12 2 L22 7 L12 12 L2 7 Z" fill="#F25C18"/>
  <path d="M2 7 L2 17 L12 22 L12 12 Z" fill="#242428"/>
  <path d="M22 7 L22 17 L12 22 L12 12 Z" fill="#37373E"/>
  <g fill="none" stroke="rgba(255,255,255,.10)" stroke-width="0.18" stroke-linejoin="round">
    <path d="M12 2 L22 7 L12 12 L2 7 Z"/>
    <path d="M2 7 L2 17 L12 22 L12 12 Z"/>
    <path d="M22 7 L22 17 L12 22 L12 12 Z"/>
  </g>`;

const iconBg = (s) => `
  <defs><radialGradient id="g" cx="50%" cy="38%" r="75%">
    <stop offset="0%" stop-color="#1A1B1F"/><stop offset="60%" stop-color="#0E0F12"/><stop offset="100%" stop-color="#08090B"/>
  </radialGradient></defs>
  <rect width="${s}" height="${s}" fill="url(#g)"/>`;

const svgs = {
  'icon-only.png': { size: 1024, transparent: false, svg: (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
      ${iconBg(s)}<g transform="translate(${s/2},${s*0.508}) scale(30) translate(-12,-12)">${CUBE}</g></svg>` },
  'icon-background.png': { size: 1024, transparent: false, svg: (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${iconBg(s)}</svg>` },
  'icon-foreground.png': { size: 1024, transparent: true, svg: (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
      <g transform="translate(${s/2},${s/2}) scale(23) translate(-12,-12)">${CUBE}</g></svg>` },
  'splash.png': { size: 2732, transparent: false, svg: (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
      <defs><radialGradient id="g" cx="50%" cy="45%" r="60%">
        <stop offset="0%" stop-color="#16171B"/><stop offset="65%" stop-color="#0C0D10"/><stop offset="100%" stop-color="#08090B"/>
      </radialGradient></defs><rect width="${s}" height="${s}" fill="url(#g)"/>
      <g transform="translate(${s/2},${s/2}) scale(26) translate(-12,-12)">${CUBE}</g></svg>` },
};

(async () => {
  const browser = await chromium.launch();
  for (const [name, cfg] of Object.entries(svgs)) {
    const page = await browser.newPage({ viewport: { width: cfg.size, height: cfg.size } });
    await page.setContent(`<!doctype html><html><body style="margin:0">${cfg.svg(cfg.size)}</body></html>`);
    await page.screenshot({ path: path.join(OUT, name), omitBackground: cfg.transparent, clip: { x: 0, y: 0, width: cfg.size, height: cfg.size } });
    console.log('✓', name);
    await page.close();
  }
  fs.copyFileSync(path.join(OUT, 'splash.png'), path.join(OUT, 'splash-dark.png'));
  console.log('✓ splash-dark.png');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
