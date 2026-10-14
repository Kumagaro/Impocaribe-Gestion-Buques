import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  test: {
    exclude: [...configDefaults.exclude, '.stryker-tmp/**'],
    // Const. art. XIII.9 y §7.6: 85 % de líneas en el dominio
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: { lines: 85 },
    },
  },
});
