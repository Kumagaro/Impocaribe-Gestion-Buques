// T030 · RF-REC-02 a 05: recuperación local de la contraseña con carné, teléfono y un código de un solo uso, y juego nuevo
// de códigos desde el perfil (RF-REC-03). El error nunca dice qué dato falló (P-04).
import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { AppError, type Clock } from '@impocaribe/shared';
import { recoverSchema, recoveryCodesResponseSchema } from '@impocaribe/shared/validation';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { auditedTransaction, recordAudit, recordRejected, type Tx } from '../audit/audit-log.ts';
import { recoveryAttempts, recoveryCodes, users } from '../db/schema/users.ts';
import { Contract } from '../http/contract.ts';
import type { DeviceRequest } from '../http/device.guard.ts';
import { idempotencyRequest, withIdempotency, type WriteResult } from '../http/idempotency.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DB } from '../tokens.ts';
import { issueRecoveryCodes, RECOVERY_CODE_COUNT } from '../users/recovery-codes.ts';
import { recordUserChange, userColumns } from '../users/users.repo.ts';
import { ALL_ROLES } from './auth.controller.ts';
import { hashSecret, verifySecret } from './password.ts';
import type { AuthedRequest } from './session.guard.ts';
import { revokeUserSessions } from './sessions.ts';

/** RF-REC-04 */
export const MAX_RECOVERY_FAILURES = 3;
const HOUR_MS = 60 * 60_000;
const DECOY = hashSecret('impocaribe-decoy-code');

type RecoverInput = z.output<typeof recoverSchema>;

/** P-04: el mismo error para cualquier dato que no coincida, exista o no el usuario, y sin decir cuántos intentos quedan. */
const failed = () => new AppError('RECOVERY_FAILED', 'Los datos no coinciden. Revíselos e inténtelo de nuevo.');

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

  /**
   * Idempotente (DT-22). Un intento fallido se confirma en la base con su respuesta, para que cuente aunque se responda
   * un error, y su repetición con la misma clave devuelve el mismo error sin contar otra vez.
   */
  @Post('recover')
  @HttpCode(204)
  @Contract({ input: recoverSchema, errors: ['RECOVERY_FAILED', 'RECOVERY_LOCKED'], roles: 'public' })
  async recover(
    @Req() req: Request,
    @Res() res: Response,
    @Body(new ZodValidationPipe(recoverSchema)) input: RecoverInput,
  ): Promise<void> {
    const deviceId = (req as DeviceRequest).device?.id ?? null;
    const result = await withIdempotency(this.db, this.clock, idempotencyRequest(req), (tx) =>
      this.attempt(tx, input, deviceId),
    );
    if (result.body === null) res.status(result.status).end();
    else res.status(result.status).json(result.body);
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

  /**
   * Siempre las mismas comprobaciones argon2 (tantas como códigos tiene un juego), exista o no el usuario y coincida o
   * no lo demás: ni el tiempo ni la respuesta revelan qué usuarios hay ni qué dato falló.
   */
  private async matchCode(hashes: { id: string; codeHash: string }[], code: string): Promise<string | null> {
    let matched: string | null = null;
    const decoy = await DECOY;
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
      const c = hashes[i];
      const ok = await verifySecret(c?.codeHash ?? decoy, code);
      if (ok && c && !matched) matched = c.id;
    }
    return matched;
  }

  private async attempt(tx: Tx, input: RecoverInput, deviceId: string | null): Promise<WriteResult> {
    const now = this.clock.now();
    const entry = { action: 'auth.recover', entityType: 'user', ...(deviceId ? { deviceId } : {}) };
    const refuse = async (error: AppError, userId?: string): Promise<WriteResult> => {
      await recordRejected(tx, this.clock, userId ? { ...entry, userId, entityId: userId } : entry, error);
      return { status: error.status, body: error.toBody() };
    };
    const [user] = await tx.select().from(users).where(eq(users.username, input.username)).for('update');
    if (!user) {
      await this.matchCode([], input.code);
      await tx.insert(recoveryAttempts).values({ userId: null, at: now, success: false, deviceId });
      return refuse(failed());
    }
    // RF-REC-04: 3 fallos seguidos dentro de una hora bloquean 1 hora desde el último; mientras dura no se cuentan más.
    const last = await this.lastFailures(tx, user.id);
    const [newest, , oldest] = last;
    if (last.length === MAX_RECOVERY_FAILURES && newest!.getTime() - oldest!.getTime() < HOUR_MS) {
      const lockedUntil = new Date(newest!.getTime() + HOUR_MS);
      if (lockedUntil > now) return refuse(lockedError(lockedUntil, now), user.id);
    }
    // Los fallos que cuentan para el próximo bloqueo: los de la última hora.
    const failures = last.filter((at) => at.getTime() > now.getTime() - HOUR_MS);
    const codes = await tx
      .select({ id: recoveryCodes.id, codeHash: recoveryCodes.codeHash })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, user.id), isNull(recoveryCodes.usedAt), isNull(recoveryCodes.invalidatedAt)));
    const matched = await this.matchCode(codes, input.code);
    const identity = user.active && user.nationalId === input.nationalId && user.phone === input.phone;
    if (!identity || !matched) {
      await tx.insert(recoveryAttempts).values({ userId: user.id, at: now, success: false, deviceId });
      if (failures.length + 1 >= MAX_RECOVERY_FAILURES)
        return refuse(lockedError(new Date(now.getTime() + HOUR_MS), now), user.id);
      return refuse(failed(), user.id);
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
    await recordUserChange(tx, this.clock, dto!);
    await recordAudit(tx, this.clock, {
      ...entry,
      userId: user.id,
      entityId: user.id,
      after: { closedSessions: closed.length },
    });
    return { status: 204, body: null };
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
