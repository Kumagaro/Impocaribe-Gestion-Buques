import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CODES, errorStatus, type ErrorCode } from './errors.ts';

// T009 · plan §6.3: catálogo de códigos de error de negocio, cada uno con su estado HTTP; §6.1: formato del cuerpo.
const PLAN_CODES = [
  'VALIDATION_ERROR',
  'FORBIDDEN',
  'SESSION_EXPIRED',
  'ACCOUNT_LOCKED',
  'RECOVERY_FAILED',
  'RECOVERY_LOCKED',
  'LAST_APODERADA',
  'DUPLICATE_DM_NUMBER',
  'DUPLICATE_PLATE',
  'DUPLICATE_NATIONAL_ID',
  'DECLARATION_PENDING_TOTAL',
  'DECLARATION_EXPIRED',
  'DECLARATION_CLOSED',
  'VESSEL_NOT_ARRIVED',
  'OVERDRAFT_ALLOCATION',
  'ALLOCATION_EXCEEDS_VESSEL',
  'ALLOCATION_EXCEEDS_DECLARATION',
  'TOTAL_BELOW_LOADED',
  'TOTAL_BELOW_ALLOCATED',
  'CAPACITY_REQUIRES_OVERRIDE',
  'SAME_DAY_REQUIRES_OVERRIDE',
  'MISSING_OFFICIAL_SIGNATURE',
  'LOADING_DATE_BEFORE_ISSUE',
  'LOADING_DATE_TOO_FAR',
  'VESSEL_CLOSED',
  'ARRIVAL_DATE_LOCKED',
  'SURPLUS_UNRESOLVED',
  'FIELD_IMMUTABLE',
  'EXPIRED_CANNOT_INCREASE',
  'IDEMPOTENCY_MISMATCH',
  'STALE_RECORD',
  'NUMBERING_CONFIRMATION_REQUIRED',
  'SERVER_PROTECTED_MODE',
  'DEVICE_NOT_PAIRED',
  'DEVICE_REVOKED',
  'PAIRING_REJECTED',
  'PAIRING_EXPIRED',
  'INSTALL_CODE_INVALID',
  'SERVER_ALREADY_EXISTS',
  'SERVER_MIGRATED',
  'INACTIVE_RESOURCE',
  'DRIVER_CARRIER_MISMATCH',
  'TRAILER_CARRIER_MISMATCH',
  'ORDER_VOIDED',
  'DRAFT_LOCKED',
  'REASON_REQUIRED',
  'PDF_RENDER_FAILED',
  'BACKUP_PASSWORD_INVALID',
  'RESTORE_IN_PROGRESS',
  'UPGRADE_REQUIRED',
  'RESYNC_REQUIRED',
  'NOT_FOUND',
  'INTERNAL_ERROR',
];

describe('plan §6.3: catálogo de códigos', () => {
  it('contiene exactamente los códigos de la tabla del plan', () => {
    expect([...ERROR_CODES].sort()).toEqual([...PLAN_CODES].sort());
  });

  it.each([
    ['VALIDATION_ERROR', 400], // datos de entrada inválidos
    ['SESSION_EXPIRED', 401], // hay que volver a iniciar sesión
    ['FORBIDDEN', 403], // rol sin permiso
    ['DEVICE_NOT_PAIRED', 403],
    ['DEVICE_REVOKED', 403],
    ['STALE_RECORD', 409], // conflicto con otra edición (DT-23)
    ['IDEMPOTENCY_MISMATCH', 409], // misma clave, otro contenido (DT-22)
    ['DRAFT_LOCKED', 409],
    ['DUPLICATE_DM_NUMBER', 409],
    ['RESYNC_REQUIRED', 410], // plan §5.9: "responde 410 RESYNC_REQUIRED"
    ['NOT_FOUND', 404],
    ['INTERNAL_ERROR', 500],
    ['ACCOUNT_LOCKED', 423],
    ['UPGRADE_REQUIRED', 426], // DT-11: "426 UPGRADE_REQUIRED"
    ['PDF_RENDER_FAILED', 503], // reintentable
    ['SERVER_PROTECTED_MODE', 503], // el servidor no acepta escrituras por batería baja
    ['OVERDRAFT_ALLOCATION', 422], // regla de negocio
    ['CAPACITY_REQUIRES_OVERRIDE', 422],
  ] as [ErrorCode, number][])('%s → HTTP %d', (code, status) => {
    expect(errorStatus(code)).toBe(status);
  });
});

describe('plan §6.1: formato del error', () => {
  it('AppError expone código, mensaje en español y detalles', () => {
    const err = new AppError(
      'OVERDRAFT_ALLOCATION',
      'Sobregiro: la orden supera el saldo por 7,280 t. Quedan 10,000 t en el DM 00431 (buque EAGLE1).',
      { requested: '17.280', balance: '10.000', excess: '7.280' },
    );
    expect(err.toBody()).toEqual({
      code: 'OVERDRAFT_ALLOCATION',
      message: 'Sobregiro: la orden supera el saldo por 7,280 t. Quedan 10,000 t en el DM 00431 (buque EAGLE1).',
      details: { requested: '17.280', balance: '10.000', excess: '7.280' },
    });
    expect(err.status).toBe(422);
  });

  it('sin detalles, el cuerpo no incluye la clave details', () => {
    expect(new AppError('FORBIDDEN', 'No tiene permiso para esta acción.').toBody()).toEqual({
      code: 'FORBIDDEN',
      message: 'No tiene permiso para esta acción.',
    });
  });
});
