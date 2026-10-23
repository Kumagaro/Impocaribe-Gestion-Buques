// T026 · Todas las llamadas de la interfaz. Importar este módulo llena `apiRegistry`, que la prueba de contrato
// (scripts/quality/contract.test.ts) compara con las rutas del servidor. Cada archivo nuevo de endpoints se añade aquí.
import './health';
import './auth';
import './pairing';
import './users';
import './sync';
import './company';
import './catalogs';
import './vessels';
import './orders';
import './alerts';
import './consultas';

export { apiRegistry, type Endpoint } from '../client';
