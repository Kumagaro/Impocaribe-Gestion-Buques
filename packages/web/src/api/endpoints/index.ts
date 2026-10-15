// T026 · Todas las llamadas de la interfaz. Importar este módulo llena `apiRegistry`, que la prueba de contrato
// (scripts/quality/contract.test.ts) compara con las rutas del servidor. Cada archivo nuevo de endpoints se añade aquí.
import './health';
import './pairing';

export { apiRegistry, type Endpoint } from '../client';
