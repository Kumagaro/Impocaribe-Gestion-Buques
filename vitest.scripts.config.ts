import { defineConfig } from 'vitest/config';

// Pruebas de scripts/ (calidad y contrato). Lleva su propio nombre para que los paquetes sin configuración no la
// hereden. La prueba de contrato carga código de web y del servidor desde su fuente.
export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'], externalConditions: ['source'] } },
  test: { dir: 'scripts', env: { TZ: 'UTC' } },
});
