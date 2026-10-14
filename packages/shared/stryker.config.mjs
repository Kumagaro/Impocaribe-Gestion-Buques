// Mutación del dominio compartido: ≥ 90 % (Const. art. XIII.7, plan §11.3). Incremental por tarea; completa cada noche.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // Con pnpm, Stryker no ve los plugins hermanos: se declaran resueltos desde este paquete.
  plugins: [import.meta.resolve('@stryker-mutator/vitest-runner')],
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  mutate: ['src/domain/**/*.ts', '!src/domain/**/*.test.ts'],
  thresholds: { high: 95, low: 90, break: 90 },
  // Sin archivos que mutar (aún no hay dominio) no hay pruebas relacionadas: no es un fallo. Un archivo sin pruebas lo frena la cobertura.
  allowEmpty: true,
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
};
