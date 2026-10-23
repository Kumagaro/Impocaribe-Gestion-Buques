// T101, T103 y T104 · plan §6.2: la bitácora (P-25) y el archivo de más de 12 meses (P-12) se consultan al servidor,
// con conexión; no se copian al dispositivo. Las rutas y sus esquemas son los del servidor (contrato, T026).
import { auditPageSchema, declarationDtoSchema, orderDtoSchema } from '@impocaribe/shared/validation';
import { z } from 'zod';
import { defineEndpoint } from '../client';

const ALL = ['apoderada', 'operador', 'lectura'] as const;

export const auditApi = {
  list: defineEndpoint({ method: 'GET', path: '/audit', output: auditPageSchema, roles: ALL }),
};

export const archiveApi = {
  orders: defineEndpoint({ method: 'GET', path: '/archive/orders', output: z.array(orderDtoSchema), roles: ALL }),
  declarations: defineEndpoint({
    method: 'GET',
    path: '/archive/declarations',
    output: z.array(declarationDtoSchema),
    roles: ALL,
  }),
};
