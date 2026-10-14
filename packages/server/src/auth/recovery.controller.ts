// T030 · RF-REC-02 a 05: recuperación local de la contraseña con carné, teléfono y un código de un solo uso, y juego nuevo
// de códigos desde el perfil (RF-REC-03). El error nunca dice qué dato falló (P-04).
import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { AppError, type Clock } from '@impocaribe/shared';
import { recoverSchema, recoveryCodesResponseSchema } from '@impocaribe/shared/validation';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Request } from 'express';
import type { z } from 'zod';
import { auditedTransaction, recordAudit, recordRejected, type Tx } from '../audit/audit-log.ts';
import { recoveryAttempts, recoveryCodes, users } from '../db/schema/users.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { recordChanges } from '../sync/change-log.ts';
import { CLOCK, DB } from '../tokens.ts';
import { issueRecoveryCodes } from '../users/recovery-codes.ts';
import { userColumns } from '../users/users.repo.ts';
import { ALL_ROLES } from './auth.controller.ts';
import { hashSecret, verifySecret } from './password.ts';
import type { AuthedRequest } from './session.guard.ts';
import { revokeUserSessions } from './sessions.ts';

/** RF-REC-04 */
export const MAX_RECOVERY_FAILURES = 3;
const HOUR_MS = 60 * 60_000;
const DECOY = hashSecret('impocaribe-decoy-code');

type RecoverInput = z.output<typeof recoverSchema>;
type Outcome = { ok: true } | { ok: false; error: AppError; userId?: string; record: boolean };

const failed = (remainingAttempts?: number) =>
  new AppError(
    'RECOVERY_FAILED',
    'Los datos no coinciden. Revíselos e inténtelo de nuevo.',
    remainingAttempts === undefined ? undefined : { remainingAttempts },
  );

function lockedError(lockedUntil: Date, now: Date) {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
  return new AppError(
    'RECOVERY_LOCKED',
    `La recuperación de este usuario quedó bloqueada 1 hora por ${MAX_RECOVERY_FAILURES} intentos fallidos. Podrá intentarlo de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`,
    { lockedUntil: lockedUntil.toISOString() },
  );
}

@Controller('auth')
export class RecoveryController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Post('recover')
  @HttpCode(204)
  @Contract({ input: recoverSchema, errors: ['RECOVERY_FAILED', 'RECOVERY_LOCKED'], roles: 'public' })
  async recover(@Req() req: Request, @Body(new ZodValidationPipe(recoverSchema)) input: RecoverInput): Promise<void> {
    const deviceId = req.header('x-device-id') ?? null;
    const outcome = await this.db.transaction((tx) => this.attempt(tx, input, deviceId));
    if (outcome.ok) return;
    if (outcome.record) {
      const entry = { action: 'auth.recover', entityType: 'user', ...(deviceId ? { deviceId } : {}) };
      await recordRejected(
        this.db,
        this.clock,
        outcome.userId ? { ...entry, userId: outcome.userId, entityId: outcome.userId } : entry,
        outcome.error,
      );
    }
    throw outcome.error;
  }

  /** Últimos fallos seguidos desde el último acierto, del más reciente al más antiguo. */
  private async lastFailures(tx: Tx, userId: string): Promise<Date[]> {
    const rows = await tx
      .select({ at: recoveryAttempts.at, success: recoveryAttempts.success })
      .from(recoveryAttempts)
      .where(eq(recoveryAttempts.userId, userId))
      .orderBy(desc(recoveryAttempts.at), desc(recoveryAttempts.id))
      .limit(MAX_RECOVERY_FAILURES);
    const out: Date[] = [];
    for (const r of rows) {
      if (r.success) break;
      out.push(r.at);
    }
    return out;
  }

  private async attempt(tx: Tx, input: RecoverInput, deviceId: string | null): Promise<Outcome> {
    const now = this.clock.now();
    const [user] = await tx.select().from(users).where(eq(users.username, input.username)).for('update');
    if (!user) {
      await verifySecret(await DECOY, input.code);
      await tx.insert(recoveryAttempts).values({ userId: null, at: now, success: false, deviceId });
      return { ok: false, error: failed(), record: true };
    }
    const reject = (error: AppError, record = true): Outcome => ({ ok: false, error, userId: user.id, record });
    // RF-REC-04: 3 fallos seguidos dentro de una hora bloquean 1 hora desde el último; mientras dura no se cuentan más.
    const last = await this.lastFailures(tx, user.id);
    const [newest, , oldest] = last;
    if (last.length === MAX_RECOVERY_FAILURES && newest!.getTime() - oldest!.getTime() < HOUR_MS) {
      const lockedUntil = new Date(newest!.getTime() + HOUR_MS);
      if (lockedUntil > now) return reject(lockedError(lockedUntil, now));
    }
    // Los fallos que cuentan para el próximo bloqueo: los de la última hora.
    const failures = last.filter((at) => at.getTime() > now.getTime() - HOUR_MS);
    const codes = await tx
      .select({ id: recoveryCodes.id, codeHash: recoveryCodes.codeHash })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, user.id), isNull(recoveryCodes.usedAt), isNull(recoveryCodes.invalidatedAt)));
    // Se comprueban todos los datos aunque uno ya falle: el tiempo de respuesta no dice cuál fue.
    let matched: string | null = null;
    for (const c of codes) if ((await verifySecret(c.codeHash, input.code)) && !matched) matched = c.id;
    const identity = user.active && user.nationalId === input.nationalId && user.phone === input.phone;
    if (!identity || !matched) {
      await tx.insert(recoveryAttempts).values({ userId: user.id, at: now, success: false, deviceId });
      const count = failures.length + 1;
      if (count >= MAX_RECOVERY_FAILURES) return reject(lockedError(new Date(now.getTime() + HOUR_MS), now));
      return reject(failed(MAX_RECOVERY_FAILURES - count));
    }
    await tx.update(recoveryCodes).set({ usedAt: now }).where(eq(recoveryCodes.id, matched));
    const [dto] = await tx
      .update(users)
      .set({
        passwordHash: await hashSecret(input.password),
        mustChangePassword: false,
        failedLogins: 0,
        lockedUntil: null,
        rowVersion: sql`${users.rowVersion} + 1`,
        updatedAt: now,
      })
      .where(eq(users.id, user.id))
      .returning(userColumns);
    await tx.insert(recoveryAttempts).values({ userId: user.id, at: now, success: true, deviceId });
    // RF-AUT-04: con la contraseña nueva se cierran todas las sesiones.
    const closed = await revokeUserSessions(tx, this.clock, user.id);
    await recordChanges(tx, this.clock, [
      { entityType: 'user', entityId: user.id, op: 'upsert', audience: 'apoderada', payload: dto },
    ]);
    await recordAudit(tx, this.clock, {
      userId: user.id,
      ...(deviceId ? { deviceId } : {}),
      action: 'auth.recover',
      entityType: 'user',
      entityId: user.id,
      after: { closedSessions: closed.length },
    });
    return { ok: true };
  }

  /** RF-REC-03: un juego nuevo de 8 códigos invalida el anterior. Se muestran una sola vez. */
  @Post('recovery-codes')
  @HttpCode(201)
  @Contract({ output: recoveryCodesResponseSchema, roles: ALL_ROLES })
  async regenerate(@Req() req: AuthedRequest): Promise<z.infer<typeof recoveryCodesResponseSchema>> {
    const { userId, sessionId, deviceId } = req.auth;
    return auditedTransaction(
      this.db,
      this.clock,
      { userId, sessionId, deviceId, action: 'auth.recovery_codes', entityType: 'user', entityId: userId },
      async (tx) => ({ value: { recoveryCodes: await issueRecoveryCodes(tx, this.clock, userId) } }),
    );
  }
}
