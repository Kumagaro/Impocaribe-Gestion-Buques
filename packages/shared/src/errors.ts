// Códigos de error de negocio del plan §6.3 con su estado HTTP, y el cuerpo de error del §6.1.
const STATUS = {
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  SESSION_EXPIRED: 401,
  ACCOUNT_LOCKED: 423,
  RECOVERY_FAILED: 422,
  RECOVERY_LOCKED: 423,
  LAST_APODERADA: 422,
  DUPLICATE_DM_NUMBER: 409,
  DUPLICATE_PLATE: 409,
  DUPLICATE_NATIONAL_ID: 409,
  DECLARATION_PENDING_TOTAL: 422,
  DECLARATION_EXPIRED: 422,
  DECLARATION_CLOSED: 422,
  VESSEL_NOT_ARRIVED: 422,
  OVERDRAFT_ALLOCATION: 422,
  ALLOCATION_EXCEEDS_VESSEL: 422,
  ALLOCATION_EXCEEDS_DECLARATION: 422,
  TOTAL_BELOW_LOADED: 422,
  TOTAL_BELOW_ALLOCATED: 422,
  CAPACITY_REQUIRES_OVERRIDE: 422,
  SAME_DAY_REQUIRES_OVERRIDE: 422,
  MISSING_OFFICIAL_SIGNATURE: 422,
  LOADING_DATE_BEFORE_ISSUE: 422,
  LOADING_DATE_TOO_FAR: 422,
  VESSEL_CLOSED: 422,
  ARRIVAL_DATE_LOCKED: 422,
  SURPLUS_UNRESOLVED: 422,
  FIELD_IMMUTABLE: 422,
  EXPIRED_CANNOT_INCREASE: 422,
  IDEMPOTENCY_MISMATCH: 409,
  STALE_RECORD: 409,
  NUMBERING_CONFIRMATION_REQUIRED: 422,
  SERVER_PROTECTED_MODE: 503,
  DEVICE_NOT_PAIRED: 403,
  DEVICE_REVOKED: 403,
  PAIRING_REJECTED: 403,
  PAIRING_EXPIRED: 410,
  INSTALL_CODE_INVALID: 403,
  SERVER_ALREADY_EXISTS: 409,
  SERVER_MIGRATED: 422,
  INACTIVE_RESOURCE: 422,
  DRIVER_CARRIER_MISMATCH: 422,
  TRAILER_CARRIER_MISMATCH: 422,
  ORDER_VOIDED: 422,
  DRAFT_LOCKED: 409,
  REASON_REQUIRED: 422,
  PDF_RENDER_FAILED: 503,
  BACKUP_PASSWORD_INVALID: 422,
  RESTORE_IN_PROGRESS: 503,
  UPGRADE_REQUIRED: 426,
  RESYNC_REQUIRED: 410,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof STATUS;
export const ERROR_CODES = Object.keys(STATUS) as ErrorCode[];

export function errorStatus(code: ErrorCode): number {
  return STATUS[code];
}

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** Error de negocio con código estable y mensaje en español (Const. §6.5, art. XI). */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = errorStatus(code);
  }

  toBody(): ErrorBody {
    return this.details
      ? { code: this.code, message: this.message, details: this.details }
      : { code: this.code, message: this.message };
  }
}
