// RF-AUT-05: 5 intentos fallidos seguidos con la contraseña bloquean 15 minutos. Cuentan los del inicio de sesión y los
// de "contraseña actual" al cambiarla, para que una sesión abierta no sirva para adivinarla.
import { AppError, type Clock } from '@impocaribe/shared';
import { eq } from 'drizzle-orm';
import { recordAudit, type Tx } from '../audit/audit-log.ts';
import { users } from '../db/schema/users.ts';

export const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60_000;
/** F-03: el aviso de intentos restantes aparece desde el 3.er fallo; antes, la respuesta es la de un usuario inexistente. */
const WARN_FROM_REMAINING = 2;

export function badCredentials(remainingAttempts?: number): AppError {
  return new AppError(
    'FORBIDDEN',
    'Usuario o contraseña incorrectos.',
    remainingAttempts !== undefined && remainingAttempts <= WARN_FROM_REMAINING ? { remainingAttempts } : undefined,
  );
}

export function lockedError(lockedUntil: Date, now: Date): AppError {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
  return new AppError(
    'ACCOUNT_LOCKED',
    `Cuenta bloqueada por ${MAX_FAILED_LOGINS} intentos fallidos. Podrá intentarlo de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`,
    { lockedUntil: lockedUntil.toISOString() },
  );
}

type LockState = { id: string; failedLogins: number; lockedUntil: Date | null };

/** El bloqueo vigente, o null. */
export function activeLock(user: LockState, now: Date): AppError | null {
  return user.lockedUntil && user.lockedUntil > now ? lockedError(user.lockedUntil, now) : null;
}

/**
 * Suma un fallo (la fila del usuario debe estar bloqueada con FOR UPDATE). Devuelve los intentos que quedan, o el error
 * de bloqueo si este fallo lo provoca (y lo deja en la bitácora).
 */
export async function registerFailure(
  tx: Tx,
  clock: Clock,
  user: LockState,
  deviceId: string,
): Promise<{ locked: AppError } | { remaining: number }> {
  const now = clock.now();
  // Un bloqueo vencido empieza la cuenta de cero.
  const failed = user.lockedUntil ? 0 : user.failedLogins;
  if (failed + 1 < MAX_FAILED_LOGINS) {
    await tx
      .update(users)
      .set({ failedLogins: failed + 1, lockedUntil: null })
      .where(eq(users.id, user.id));
    return { remaining: MAX_FAILED_LOGINS - failed - 1 };
  }
  const lockedUntil = new Date(now.getTime() + LOCK_MS);
  await tx.update(users).set({ failedLogins: 0, lockedUntil }).where(eq(users.id, user.id));
  await recordAudit(tx, clock, {
    userId: user.id,
    deviceId,
    action: 'auth.locked',
    entityType: 'user',
    entityId: user.id,
    after: { lockedUntil: lockedUntil.toISOString() },
  });
  return { locked: lockedError(lockedUntil, now) };
}
