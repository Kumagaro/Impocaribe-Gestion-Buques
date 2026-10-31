import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  test: {
    // dist es compilado (y puede tener pruebas viejas de antes de excluirlas del build): solo se prueba src.
    exclude: [...configDefaults.exclude, '.stryker-tmp/**', 'dist/**'],
    // Las pruebas no dependen de la zona horaria del equipo: el dominio fija America/Havana explícitamente.
    env: { TZ: 'UTC' },
    // Const. art. XIII.9 y §7.6: 85 % de líneas en el dominio
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/testing/**'],
      thresholds: { lines: 85 },
    },
  },
});
