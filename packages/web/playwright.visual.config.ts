// T026 · plan §11.2: referencias visuales de Storybook por historia, tema y clase de dispositivo. Las referencias se
// toman en Windows (la plataforma de las apps) con Chrome for Testing fijo; por eso esta batería corre en el equipo de
// desarrollo (pnpm verify) y no en la CI de Linux, donde las fuentes del sistema son otras.
import { defineConfig } from '@playwright/test';
import { chromePath, STORYBOOK_PORT } from './e2e/support/env';

export default defineConfig({
  testDir: 'e2e/visual',
  testMatch: /.*\.visual\.ts$/,
  fullyParallel: true,
  forbidOnly: true,
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${STORYBOOK_PORT}`,
    launchOptions: {
      executablePath: chromePath(),
      // Rasterización en software y en un solo hilo: sin ellas, el antialiasing de esquinas y bordes discontinuos
      // varía unos píxeles entre ejecuciones y la comparación sin tolerancia falla sin cambio real.
      args: [
        '--disable-gpu',
        '--disable-gpu-rasterization',
        '--disable-partial-raster',
        '--num-raster-threads=1',
        '--force-color-profile=srgb',
      ],
    },
  },
  expect: {
    // Un solo píxel distinto ya es una diferencia (T026).
    toHaveScreenshot: { maxDiffPixels: 0, threshold: 0, animations: 'disabled', caret: 'hide' },
  },
  snapshotPathTemplate: '{testDir}/references/{arg}{ext}',
  projects: [{ name: 'visual' }],
  webServer: {
    // Compilado y servido como estático: carga mucho más rápido que el modo desarrollo.
    command: `pnpm exec storybook build -o storybook-static --quiet && node e2e/support/static-server.ts storybook-static ${STORYBOOK_PORT}`,
    url: `http://127.0.0.1:${STORYBOOK_PORT}/index.json`,
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
