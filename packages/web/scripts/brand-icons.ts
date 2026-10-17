// Iconos de las apps a partir del logo (public/favicon.svg): lanzador de Android (normal, redondo y la capa del icono
// adaptable) y ventana de Electron. Se rasterizan con el Chrome for Testing de las pruebas, así salen iguales siempre.
// Uso: pnpm --filter @impocaribe/web brand-icons. Se ejecuta a mano cuando cambia el logo y se versionan los PNG.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { chromePath } from '../e2e/support/env.ts';

const ACCENT = '#1a3e96';
const logo = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
// El barco tal como está en el logo, para dibujarlo con otro fondo o tamaño.
const ship = logo.slice(logo.indexOf('<g '), logo.indexOf('</g>') + '</g>'.length);

const android = fileURLToPath(new URL('../../android/android/app/src/main/res/', import.meta.url));
const desktop = fileURLToPath(new URL('../../desktop/resources/', import.meta.url));
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 } as const;

/** El barco sobre un fondo en una caja de 24: el logo cuadrado, el redondo o solo el barco (fondo transparente). */
const svg = (shape: 'square' | 'circle' | 'none', scale = 1) => {
  const bg =
    shape === 'square'
      ? `<rect width="24" height="24" rx="6" fill="${ACCENT}"/>`
      : shape === 'circle'
        ? `<circle cx="12" cy="12" r="12" fill="${ACCENT}"/>`
        : '';
  // La capa adaptable de Android recorta hasta un 33 %: el barco va más pequeño, dentro de la zona segura de 66/108.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${bg}<g transform="translate(12 12) scale(${scale}) translate(-12 -12)">${ship}</g></svg>`;
};

const browser = await chromium.launch({ executablePath: chromePath() });
const page = await browser.newPage();
async function render(file: string, size: number, markup: string) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  writeFileSync(file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
}

for (const [density, k] of Object.entries(DENSITIES)) {
  const dir = `${android}mipmap-${density}/`;
  await render(`${dir}ic_launcher.png`, 48 * k, svg('square'));
  await render(`${dir}ic_launcher_round.png`, 48 * k, svg('circle'));
  await render(`${dir}ic_launcher_foreground.png`, 108 * k, svg('none', 0.66));
}
writeFileSync(
  `${android}values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${ACCENT}</color>\n</resources>\n`,
);
await render(`${desktop}icon.png`, 512, svg('square'));
await browser.close();
console.log('Iconos generados para Android y Electron.');
