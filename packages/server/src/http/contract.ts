// T026 · plan §7.6 y §11.2: cada ruta declara su contrato (esquemas compartidos, códigos de error y roles). La prueba de
// contrato lo compara con el registro de llamadas de web; la guarda de sesión (F1) aplicará los mismos roles.
import { SetMetadata } from '@nestjs/common';
import type { ErrorCode, Role } from '@impocaribe/shared';
import type { ZodType } from 'zod';

export const CONTRACT = 'impocaribe:contract';

export interface RouteContract {
  input?: ZodType;
  output?: ZodType;
  /** Códigos de negocio que puede devolver, además de los generales (VALIDATION_ERROR, INTERNAL_ERROR…). */
  errors?: readonly ErrorCode[];
  /** Roles que pueden llamarla; 'public' si no pide sesión. */
  roles: readonly Role[] | 'public';
}

export const Contract = (contract: RouteContract) => SetMetadata(CONTRACT, contract);
