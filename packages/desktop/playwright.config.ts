// T115 · plan §11.2: pruebas de la app de escritorio de verdad (Electron). Antes: el build de shared, de web y de
// desktop (`pnpm --filter @impocaribe/desktop e2e` los hace).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.e2e\.ts$/,
  forbidOnly: true,
  workers: 1,
  reporter: [['list']],
  timeout: 120_000,
});
