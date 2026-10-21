// T066 · plan §6.2: buques, DM y asignaciones (P-07 a P-11). Todos los leen (las pantallas, desde la copia local);
// Apoderadas y Operadores los cambian. Las rutas y sus esquemas son los del servidor (contrato, T026).
import {
  allocationDtoSchema,
  allocationSchema,
  arrivalSchema,
  closeVesselSchema,
  declarationDtoSchema,
  declarationHistorySchema,
  declarationSchema,
  editAllocationSchema,
  editDeclarationSchema,
  editVesselSchema,
  reactivateDeclarationSchema,
  surplusDispositionSchema,
  vesselDtoSchema,
  vesselHistorySchema,
  vesselSchema,
  vesselSurplusSchema,
} from '@impocaribe/shared/validation';
import { z } from 'zod';
import { defineEndpoint } from '../client';

const ALL = ['apoderada', 'operador', 'lectura'] as const;
const EDITORS = ['apoderada', 'operador'] as const;
const ALLOCATION_ERRORS = [
  'DECLARATION_PENDING_TOTAL',
  'DECLARATION_EXPIRED',
  'DECLARATION_CLOSED',
  'VESSEL_CLOSED',
  'ALLOCATION_EXCEEDS_VESSEL',
  'ALLOCATION_EXCEEDS_DECLARATION',
] as const;

export const vesselsApi = {
  list: defineEndpoint({ method: 'GET', path: '/vessels', output: z.array(vesselDtoSchema), roles: ALL }),
  one: defineEndpoint({ method: 'GET', path: '/vessels/:id', output: vesselDtoSchema, roles: ALL }),
  create: defineEndpoint({
    method: 'POST',
    path: '/vessels',
    input: vesselSchema,
    output: vesselDtoSchema,
    roles: EDITORS,
  }),
  edit: defineEndpoint({
    method: 'PATCH',
    path: '/vessels/:id',
    input: editVesselSchema,
    output: vesselDtoSchema,
    errors: ['STALE_RECORD', 'TOTAL_BELOW_ALLOCATED', 'TOTAL_BELOW_LOADED', 'REASON_REQUIRED', 'FIELD_IMMUTABLE'],
    roles: EDITORS,
  }),
  arrival: defineEndpoint({
    method: 'POST',
    path: '/vessels/:id/arrival',
    input: arrivalSchema,
    output: vesselDtoSchema,
    errors: ['STALE_RECORD', 'ARRIVAL_DATE_LOCKED', 'REASON_REQUIRED'],
    roles: EDITORS,
  }),
  surplus: defineEndpoint({ method: 'GET', path: '/vessels/:id/surplus', output: vesselSurplusSchema, roles: ALL }),
  dispose: defineEndpoint({
    method: 'POST',
    path: '/vessels/:id/surplus-dispositions',
    input: surplusDispositionSchema,
    output: vesselSurplusSchema,
    errors: [
      'VESSEL_CLOSED',
      'ALLOCATION_EXCEEDS_VESSEL',
      'ALLOCATION_EXCEEDS_DECLARATION',
      'DECLARATION_PENDING_TOTAL',
      'DECLARATION_EXPIRED',
      'DECLARATION_CLOSED',
    ],
    roles: EDITORS,
  }),
  close: defineEndpoint({
    method: 'POST',
    path: '/vessels/:id/close',
    input: closeVesselSchema,
    output: vesselDtoSchema,
    errors: ['STALE_RECORD', 'SURPLUS_UNRESOLVED', 'VESSEL_CLOSED'],
    roles: EDITORS,
  }),
  history: defineEndpoint({ method: 'GET', path: '/vessels/:id/history', output: vesselHistorySchema, roles: ALL }),
};

export const declarationsApi = {
  list: defineEndpoint({ method: 'GET', path: '/declarations', output: z.array(declarationDtoSchema), roles: ALL }),
  one: defineEndpoint({ method: 'GET', path: '/declarations/:id', output: declarationDtoSchema, roles: ALL }),
  create: defineEndpoint({
    method: 'POST',
    path: '/declarations',
    input: declarationSchema,
    output: declarationDtoSchema,
    errors: ['DUPLICATE_DM_NUMBER', ...ALLOCATION_ERRORS],
    roles: EDITORS,
  }),
  edit: defineEndpoint({
    method: 'POST',
    path: '/declarations/:id/versions',
    input: editDeclarationSchema,
    output: declarationDtoSchema,
    errors: ['STALE_RECORD', 'TOTAL_BELOW_LOADED', 'TOTAL_BELOW_ALLOCATED'],
    roles: EDITORS,
  }),
  reactivate: defineEndpoint({
    method: 'POST',
    path: '/declarations/:id/reactivate',
    input: reactivateDeclarationSchema,
    output: declarationDtoSchema,
    errors: ['STALE_RECORD'],
    roles: EDITORS,
  }),
  history: defineEndpoint({
    method: 'GET',
    path: '/declarations/:id/history',
    output: declarationHistorySchema,
    roles: ALL,
  }),
  allocate: defineEndpoint({
    method: 'POST',
    path: '/declarations/:id/allocations',
    input: allocationSchema,
    output: declarationDtoSchema,
    errors: [...ALLOCATION_ERRORS],
    roles: EDITORS,
  }),
};

export const editAllocation = defineEndpoint({
  method: 'PATCH',
  path: '/allocations/:id',
  input: editAllocationSchema,
  output: allocationDtoSchema,
  errors: ['STALE_RECORD', 'TOTAL_BELOW_LOADED', ...ALLOCATION_ERRORS],
  roles: EDITORS,
});
