// T122 · plan §11.2: pruebas de humo en la app Android real, en un emulador, contra el mismo servidor de extremo a
// extremo (sin TLS). Aparte de las E2E del navegador porque necesitan un emulador encendido y el APK de prueba:
//   pnpm --filter @impocaribe/web build && pnpm --filter @impocaribe/android apk:e2e
//   pnpm --filter @impocaribe/web e2e:android
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  // Un solo emulador: una prueba a la vez.
  workers: 1,
  fullyParallel: false,
  timeout: 15 * 60_000,
  projects: [
    base.projects!.find((p) => p.name === 'primer-arranque')!,
    { name: 'android', testMatch: /android\.e2e\.ts$/, dependencies: ['primer-arranque'] },
  ],
});
