import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // shared se prueba desde su código fuente (condición `source`), no desde su dist compilado
  ssr: { resolve: { conditions: ['source'], externalConditions: ['source'] } },
  test: {
    // dist es compilado y e2e son las pruebas de la app real (Playwright): solo se prueba src.
    exclude: [...configDefaults.exclude, 'dist/**', 'e2e/**'],
    // Sockets UDP y mDNS reales en 127.0.0.1: con el equipo cargado, 5 s no alcanzan.
    testTimeout: 20_000,
  },
});
