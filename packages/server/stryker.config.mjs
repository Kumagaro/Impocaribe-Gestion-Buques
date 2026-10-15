import { existsSync } from 'node:fs';

// Mutación de las transacciones críticas del servidor: ≥ 90 % (Const. art. XIII.7, plan §11.3). Incremental por tarea.
// Cada tarea añade a `mutate` su módulo crítico (emisión, corrección, anulación, asignación, vencimiento, numeración,
// restauración y sincronización).

// Las pruebas no dependen de la zona horaria del equipo (igual que en vitest.config.ts); los procesos hijos la heredan.
process.env.TZ = 'UTC';
// Dentro del sandbox, config.ts no encuentra el .env de la raíz por ruta relativa: se carga aquí y los hijos lo heredan.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // Con pnpm, Stryker no ve los plugins hermanos: se declaran resueltos desde este paquete.
  plugins: [import.meta.resolve('@stryker-mutator/vitest-runner')],
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  mutate: ['src/sync/**/*.ts', 'src/http/idempotency.ts', '!src/**/*.test.ts'],
  // Las pruebas de integración usan PostgreSQL real: menos procesos a la vez y más margen.
  concurrency: 2,
  timeoutMS: 30_000,
  // La ejecución inicial pasa toda la suite con la cobertura por prueba; las de autenticación hacen a propósito muchas
  // comprobaciones argon2id de 64 MB (T029, T030) y, con dos procesos, superan los 5 minutos por defecto.
  dryRunTimeoutMinutes: 20,
  thresholds: { high: 95, low: 90, break: 90 },
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
};
