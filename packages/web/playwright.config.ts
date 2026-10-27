// T026 · plan §11.2: extremo a extremo contra el servidor y PostgreSQL reales, en las tres clases de dispositivo.
// Las referencias visuales van aparte, en playwright.visual.config.ts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { chromePath, E2E_IDENTITY, E2E_IDENTITY_DIR, e2eDatabaseUrl, SERVER_PORT, WEB_PORT } from './e2e/support/env';

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 } },
} as const;

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

// El servidor de la prueba tiene una identidad fija para /discovery, sin claves (sirve HTTP y no se anuncia en la red).
mkdirSync(E2E_IDENTITY_DIR, { recursive: true });
writeFileSync(join(E2E_IDENTITY_DIR, 'identity.json'), JSON.stringify(E2E_IDENTITY));

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: true,
  forbidOnly: true,
  // Crear usuarios, entrar y recuperar hacen varias comprobaciones argon2id de 64 MB a propósito (T029, T030).
  expect: { timeout: 20_000 },
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    launchOptions: { executablePath: chromePath() },
    trace: 'retain-on-failure',
  },
  projects: [
    // P-02: el primer arranque se hace una vez, en la PC servidor, y deja un usuario por clase (e2e/setup.e2e.ts).
    { name: 'primer-arranque', testMatch: /setup\.e2e\.ts$/, use: DEVICES.desktop, metadata: { device: 'desktop' } },
    ...Object.entries(DEVICES).map(([device, use]) => ({
      name: `e2e-${device}`,
      use,
      metadata: { device },
      // La de Android corre aparte, con su emulador (playwright.android.config.ts).
      testIgnore: /(setup|android)\.e2e\.ts$/,
      dependencies: ['primer-arranque'],
    })),
  ],
  webServer: [
    {
      name: 'servidor',
      // Base propia recreada y migrada; shared y el servidor compilados como en producción.
      command:
        // shared primero: db:reset lo usa (código de instalación de desarrollo, T052) desde su dist.
        'pnpm --filter @impocaribe/shared build && pnpm --filter @impocaribe/server db:reset && ' +
        'pnpm --filter @impocaribe/server build && node packages/server/dist/main.js',
      cwd: repoRoot,
      url: `http://127.0.0.1:${SERVER_PORT}/api/v1/health`,
      env: {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: e2eDatabaseUrl(),
        PORT: String(SERVER_PORT),
        IMPOCARIBE_IDENTITY_DIR: E2E_IDENTITY_DIR,
        IMPOCARIBE_TLS: 'off',
      },
      // Reiniciar la base, compilar shared y el servidor y arrancarlo pasa de 3 min en el equipo de desarrollo.
      timeout: 360_000,
      reuseExistingServer: false,
    },
    {
      name: 'web',
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      // La app llega al servidor por el mismo origen: vite redirige /api (vite.config.ts).
      env: { IMPOCARIBE_API_URL: `http://127.0.0.1:${SERVER_PORT}` },
      url: `http://127.0.0.1:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
