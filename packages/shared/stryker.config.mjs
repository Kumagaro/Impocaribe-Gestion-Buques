// Mutación del dominio compartido: ≥ 90 % (Const. art. XIII.7, plan §11.3). Incremental por tarea; completa cada noche.
// Las pruebas no dependen de la zona horaria del equipo (igual que en vitest.config.ts); los procesos hijos la heredan.
process.env.TZ = 'UTC';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // Con pnpm, Stryker no ve los plugins hermanos: se declaran resueltos desde este paquete.
  plugins: [import.meta.resolve('@stryker-mutator/vitest-runner')],
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  mutate: ['src/domain/**/*.ts', 'src/validation/warnings.ts', '!src/**/*.test.ts'],
  thresholds: { high: 95, low: 90, break: 90 },
  // Sin archivos de dominio no hay nada que mutar: no es un fallo. Un archivo sin pruebas lo frena la cobertura.
  allowEmpty: true,
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
};
