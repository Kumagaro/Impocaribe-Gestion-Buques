import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // shared se prueba desde su código fuente (condición `source`), no desde su dist compilado
  ssr: { resolve: { conditions: ['source'], externalConditions: ['source'] } },
  test: {
    exclude: [...configDefaults.exclude, '.stryker-tmp/**'],
    // Plantilla de PostgreSQL migrada una vez; cada suite de integración clona la suya (test/suite-db.ts).
    globalSetup: ['test/global-setup.ts'],
    // Muchas pruebas arrancan la app Nest completa: con el equipo cargado, 5 s no alcanzan.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Las pruebas no dependen de la zona horaria del equipo: el dominio fija America/Havana explícitamente.
    env: { TZ: 'UTC' },
    // Const. art. XIII.9 y §7.6: 85 % de líneas en el servidor
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Puntos de entrada de proceso (arranque y CLI de desarrollo): se verifican al ejecutarlos, no con pruebas unitarias.
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/db/cli.ts'],
      thresholds: { lines: 85 },
    },
  },
});
