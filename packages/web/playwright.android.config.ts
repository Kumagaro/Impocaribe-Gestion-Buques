// T122 · plan §11.2: pruebas de humo en la app Android real, en un emulador, contra el mismo servidor de extremo a
// extremo (sin TLS). Aparte de las E2E del navegador porque necesitan un emulador encendido y el APK de prueba:
//   pnpm --filter @impocaribe/web build && pnpm --filter @impocaribe/android apk:e2e
//   pnpm --filter @impocaribe/web e2e:android
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// El primer arranque crea solo la Apoderada (e2e/setup.e2e.ts): los usuarios de las pruebas del navegador sobran aquí.
process.env.E2E_SOLO_APODERADA = '1';

export default defineConfig({
  ...base,
  // Con el emulador encendido, el equipo de desarrollo tarda más en preparar el servidor de la prueba.
  webServer: (Array.isArray(base.webServer) ? base.webServer : [base.webServer!]).map((w) => ({
    ...w,
    timeout: 600_000,
  })),
  // Un solo emulador: una prueba a la vez.
  workers: 1,
  fullyParallel: false,
  timeout: 15 * 60_000,
  projects: [
    base.projects!.find((p) => p.name === 'primer-arranque')!,
    { name: 'android', testMatch: /android\.e2e\.ts$/, dependencies: ['primer-arranque'] },
  ],
});
