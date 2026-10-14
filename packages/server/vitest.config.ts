import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  test: {
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
