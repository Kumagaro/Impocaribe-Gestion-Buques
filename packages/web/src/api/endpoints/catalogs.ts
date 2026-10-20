// T056 · plan §6.2: catálogos (P-18 a P-20). Todos los leen (las pantallas, desde la copia local); Apoderadas y
// Operadores los cambian. Las rutas y sus esquemas son los del servidor (contrato, T026).
import {
  carrierDtoSchema,
  carrierSchema,
  changeDriverCarrierSchema,
  clientDtoSchema,
  clientSchema,
  driverDtoSchema,
  driverSchema,
  editCarrierSchema,
  editClientSchema,
  editDriverSchema,
  editTrailerSchema,
  editTruckSchema,
  trailerDtoSchema,
  trailerSchema,
  truckDtoSchema,
  truckSchema,
} from '@impocaribe/shared/validation';
import { z } from 'zod';
import { defineEndpoint } from '../client';

const ALL = ['apoderada', 'operador', 'lectura'] as const;
const EDITORS = ['apoderada', 'operador'] as const;

/** Lista, alta, edición, activar y desactivar de un catálogo. */
function catalog<D extends z.ZodType, N extends z.ZodType, E extends z.ZodType>(
  path: string,
  dto: D,
  create: N,
  edit: E,
  createErrors: ('DUPLICATE_PLATE' | 'DUPLICATE_NATIONAL_ID')[] = [],
) {
  return {
    list: defineEndpoint({ method: 'GET', path, output: z.array(dto), roles: ALL }),
    create: defineEndpoint({ method: 'POST', path, input: create, output: dto, errors: createErrors, roles: EDITORS }),
    edit: defineEndpoint({
      method: 'PATCH',
      path: `${path}/:id`,
      input: edit,
      output: dto,
      errors: [...createErrors, 'STALE_RECORD'],
      roles: EDITORS,
    }),
    activate: defineEndpoint({ method: 'POST', path: `${path}/:id/activate`, output: dto, roles: EDITORS }),
    deactivate: defineEndpoint({ method: 'POST', path: `${path}/:id/deactivate`, output: dto, roles: EDITORS }),
  };
}

export const clientsApi = catalog('/clients', clientDtoSchema, clientSchema, editClientSchema);
export const carriersApi = catalog('/carriers', carrierDtoSchema, carrierSchema, editCarrierSchema);
export const trailersApi = catalog('/trailers', trailerDtoSchema, trailerSchema, editTrailerSchema, [
  'DUPLICATE_PLATE',
]);
export const trucksApi = catalog('/trucks', truckDtoSchema, truckSchema, editTruckSchema, ['DUPLICATE_PLATE']);
export const driversApi = catalog('/drivers', driverDtoSchema, driverSchema, editDriverSchema, [
  'DUPLICATE_NATIONAL_ID',
]);
export const changeDriverCarrier = defineEndpoint({
  method: 'POST',
  path: '/drivers/:id/carrier',
  input: changeDriverCarrierSchema,
  output: driverDtoSchema,
  errors: ['STALE_RECORD'],
  roles: EDITORS,
});
