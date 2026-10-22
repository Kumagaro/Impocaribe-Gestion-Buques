// T079 a T083 y T076 · plan §6.2: órdenes y borradores (P-13 a P-16). Todos leen las órdenes (desde la copia local);
// Apoderadas y Operadores emiten, corrigen, anulan y tienen borradores. Las rutas y sus esquemas son los del servidor
// (contrato, T026).
import {
  correctOrderSchema,
  draftDtoSchema,
  draftPayloadSchema,
  issueOrderSchema,
  orderCheckResponseSchema,
  orderDtoSchema,
  pdfFileSchema,
  saveDraftSchema,
  syncDraftsSchema,
  voidOrderSchema,
} from '@impocaribe/shared/validation';
import { z } from 'zod';
import { defineEndpoint } from '../client';

const ALL = ['apoderada', 'operador', 'lectura'] as const;
const EDITORS = ['apoderada', 'operador'] as const;
const ISSUE_ERRORS = [
  'MISSING_OFFICIAL_SIGNATURE',
  'DECLARATION_PENDING_TOTAL',
  'DECLARATION_EXPIRED',
  'DECLARATION_CLOSED',
  'VESSEL_CLOSED',
  'VESSEL_NOT_ARRIVED',
  'OVERDRAFT_ALLOCATION',
  'LOADING_DATE_BEFORE_ISSUE',
  'LOADING_DATE_TOO_FAR',
  'INACTIVE_RESOURCE',
  'DRIVER_CARRIER_MISMATCH',
  'TRAILER_CARRIER_MISMATCH',
  'CAPACITY_REQUIRES_OVERRIDE',
  'SAME_DAY_REQUIRES_OVERRIDE',
  'PDF_RENDER_FAILED',
] as const;

export const ordersApi = {
  list: defineEndpoint({ method: 'GET', path: '/orders', output: z.array(orderDtoSchema), roles: ALL }),
  one: defineEndpoint({ method: 'GET', path: '/orders/:id', output: orderDtoSchema, roles: ALL }),
  check: defineEndpoint({
    method: 'POST',
    path: '/orders/check',
    input: issueOrderSchema,
    output: orderCheckResponseSchema,
    roles: EDITORS,
  }),
  issue: defineEndpoint({
    method: 'POST',
    path: '/orders',
    input: issueOrderSchema,
    output: orderDtoSchema,
    errors: [...ISSUE_ERRORS],
    roles: EDITORS,
  }),
  correct: defineEndpoint({
    method: 'POST',
    path: '/orders/:id/corrections',
    input: correctOrderSchema,
    output: orderDtoSchema,
    errors: [...ISSUE_ERRORS, 'STALE_RECORD', 'ORDER_VOIDED', 'EXPIRED_CANNOT_INCREASE'],
    roles: EDITORS,
  }),
  void: defineEndpoint({
    method: 'POST',
    path: '/orders/:id/void',
    input: voidOrderSchema,
    output: orderDtoSchema,
    errors: ['STALE_RECORD', 'ORDER_VOIDED'],
    roles: EDITORS,
  }),
  pdf: defineEndpoint({ method: 'GET', path: '/orders/:id/versions/:n/pdf', output: pdfFileSchema, roles: ALL }),
};

const draft = (method: 'POST' | 'DELETE', path: string, input?: z.ZodType) =>
  defineEndpoint({
    method,
    path,
    ...(input ? { input } : {}),
    output: draftDtoSchema,
    errors: ['DRAFT_LOCKED'],
    roles: EDITORS,
  });

export const draftsApi = {
  list: defineEndpoint({ method: 'GET', path: '/drafts', output: z.array(draftDtoSchema), roles: EDITORS }),
  save: draft('POST', '/drafts', saveDraftSchema),
  sync: defineEndpoint({
    method: 'POST',
    path: '/drafts/sync',
    input: syncDraftsSchema,
    output: z.array(draftDtoSchema),
    roles: EDITORS,
  }),
  edit: defineEndpoint({
    method: 'PATCH',
    path: '/drafts/:id',
    input: z.object({ payload: draftPayloadSchema }),
    output: draftDtoSchema,
    errors: ['DRAFT_LOCKED'],
    roles: EDITORS,
  }),
  share: defineEndpoint({ method: 'POST', path: '/drafts/:id/share', output: draftDtoSchema, roles: EDITORS }),
  lock: draft('POST', '/drafts/:id/lock'),
  heartbeat: draft('POST', '/drafts/:id/heartbeat'),
  unlock: defineEndpoint({ method: 'DELETE', path: '/drafts/:id/lock', output: draftDtoSchema, roles: EDITORS }),
  discard: draft('DELETE', '/drafts/:id'),
};
