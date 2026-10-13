import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: la interfaz va incluida en cada app (app:// en Electron, recursos en Capacitor), DT-02
  base: './',
  resolve: { conditions: ['source'] },
  // WebView mínimo Chromium 87 (DT-15)
  build: { target: 'chrome87' },
  test: { environment: 'jsdom' },
});
