// Mutación del dominio compartido: ≥ 90 % (Const. art. XIII.7, plan §11.3). Incremental por tarea; completa cada noche.
import { fileURLToPath, URL } from 'node:url';

// Ruta absoluta: dentro del sandbox de Stryker, npx no encuentra el binario con los enlaces de pnpm.
const vitest = fileURLToPath(new URL('../vitest.mjs', import.meta.resolve('vitest')));

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // shortcut: el runner de Vitest de Stryker 10 no ejecuta ninguna prueba por mutante con Vitest 5 (todos "sobreviven"),
  // así que se usa el runner de comandos: una ejecución completa de las pruebas del dominio por mutante. Volver al
  // runner 'vitest' cuando sea compatible, porque es mucho más rápido.
  testRunner: 'command',
  commandRunner: { command: `node "${vitest}" run src/domain` },
  coverageAnalysis: 'off',
  // Arrancar Vitest por mutante tarda segundos: con poco margen, mutantes que las pruebas matan acaban como "timeout".
  timeoutMS: 30_000,
  mutate: ['src/domain/**/*.ts', '!src/domain/**/*.test.ts'],
  thresholds: { high: 95, low: 90, break: 90 },
  // Sin archivos de dominio no hay nada que mutar: no es un fallo. Un archivo sin pruebas lo frena la cobertura.
  allowEmpty: true,
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
};
