import { defineConfig } from 'vitest/config';

// Pruebas de scripts/ (calidad y contrato). La prueba de contrato carga código de web y del servidor desde su fuente.
export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'], externalConditions: ['source'] } },
  test: { dir: 'scripts', env: { TZ: 'UTC' } },
});
