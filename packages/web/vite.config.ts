import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: la interfaz va incluida en cada app (app:// en Electron, recursos en Capacitor), DT-02
  base: './',
  resolve: { conditions: ['source'] },
  // WebView mínimo Chromium 87 (DT-15)
  build: { target: 'chrome87' },
  // En el navegador de desarrollo y de las pruebas de extremo a extremo, el servidor se alcanza por el mismo origen: así
  // no hace falta abrir CORS a otros orígenes (las apps hablan con él por su transporte nativo, DT-19).
  server: {
    proxy: { '/api': { target: process.env.IMPOCARIBE_API_URL ?? 'http://127.0.0.1:8443', secure: false } },
  },
  test: { environment: 'jsdom', setupFiles: ['test/setup.ts'] },
});
