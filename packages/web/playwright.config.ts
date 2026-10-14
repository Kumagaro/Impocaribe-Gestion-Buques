// T026 · plan §11.2: extremo a extremo contra el servidor y PostgreSQL reales, en las tres clases de dispositivo.
// Las referencias visuales van aparte, en playwright.visual.config.ts.
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { chromePath, e2eDatabaseUrl, SERVER_PORT, WEB_PORT } from './e2e/support/env';

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 } },
} as const;

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: true,
  forbidOnly: true,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    launchOptions: { executablePath: chromePath() },
    trace: 'retain-on-failure',
  },
  projects: Object.entries(DEVICES).map(([device, use]) => ({ name: `e2e-${device}`, use, metadata: { device } })),
  webServer: [
    {
      name: 'servidor',
      // Base propia recreada y migrada; shared y el servidor compilados como en producción.
      command:
        'pnpm --filter @impocaribe/server db:reset && pnpm --filter @impocaribe/shared build && ' +
        'pnpm --filter @impocaribe/server build && node packages/server/dist/main.js',
      cwd: repoRoot,
      url: `http://127.0.0.1:${SERVER_PORT}/api/v1/health`,
      env: { NODE_ENV: 'test', TEST_DATABASE_URL: e2eDatabaseUrl(), PORT: String(SERVER_PORT) },
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      name: 'web',
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
