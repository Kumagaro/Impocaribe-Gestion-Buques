// T029 · RF-AUT-01 a 07 y 10, plan §6.2: inicio de sesión, sesiones propias y cambio de contraseña.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ACTIONS, AppError, can, type Clock } from '@impocaribe/shared';
import {
  changePasswordSchema,
  loginRequestSchema,
  loginResponseSchema,
  meResponseSchema,
  sessionsResponseSchema,
} from '@impocaribe/shared/validation';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';
import { auditedTransaction, recordAudit, recordRejected, type Tx } from '../audit/audit-log.ts';
import { sessions, users } from '../db/schema/users.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { recordChanges } from '../sync/change-log.ts';
import { CLOCK, DB } from '../tokens.ts';
import { userColumns } from '../users/users.repo.ts';
import { hashSecret, verifySecret } from './password.ts';
import type { AuthedRequest } from './session.guard.ts';
import { createSession, revokeUserSessions } from './sessions.ts';

export const ALL_ROLES = ['apoderada', 'operador', 'lectura'] as const;
/** RF-AUT-05: 5 intentos fallidos seguidos bloquean 15 minutos. */
export const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60_000;
/** Un hash cualquiera para gastar el mismo tiempo cuando el usuario no existe: el tiempo no revela qué usuarios hay. */
const DECOY = hashSecret('impocaribe-decoy');

type LoginRequest = z.output<typeof loginRequestSchema>;
type LoginResponse = z.infer<typeof loginResponseSchema>;
/** Resultado de la transacción del login: un rechazo se responde después del COMMIT, para que el contador quede. */
type LoginOutcome =
  { ok: true; value: LoginResponse } | { ok: false; error: AppError; userId?: string; audited: boolean };

const badCredentials = (remainingAttempts?: number) =>
  new AppError(
    'FORBIDDEN',
    'Usuario o contraseña incorrectos.',
    remainingAttempts === undefined ? undefined : { remainingAttempts },
  );

export function lockedError(lockedUntil: Date, now: Date): AppError {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
  return new AppError(
    'ACCOUNT_LOCKED',
    `Cuenta bloqueada por ${MAX_FAILED_LOGINS} intentos fallidos. Podrá intentarlo de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`,
    { lockedUntil: lockedUntil.toISOString() },
  );
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Contract({ input: loginRequestSchema, output: loginResponseSchema, roles: 'public' })
  async login(@Body(new ZodValidationPipe(loginRequestSchema)) input: LoginRequest): Promise<LoginResponse> {
    const outcome = await this.db.transaction((tx) => this.attempt(tx, input));
    if (outcome.ok) return outcome.value;
    if (!outcome.audited) {
      const entry = { action: 'auth.login', deviceId: input.deviceId };
      await recordRejected(
        this.db,
        this.clock,
        outcome.userId ? { ...entry, userId: outcome.userId } : entry,
        outcome.error,
      );
    }
    throw outcome.error;
  }

  private async attempt(tx: Tx, input: LoginRequest): Promise<LoginOutcome> {
    const now = this.clock.now();
    // FOR UPDATE: dos intentos a la vez del mismo usuario se cuentan los dos.
    const [user] = await tx.select().from(users).where(eq(users.username, input.username)).for('update');
    if (!user) {
      await verifySecret(await DECOY, input.password);
      return { ok: false, error: badCredentials(), audited: false };
    }
    const reject = (error: AppError, audited = false): LoginOutcome => ({ ok: false, error, userId: user.id, audited });
    if (user.lockedUntil && user.lockedUntil > now) return reject(lockedError(user.lockedUntil, now));
    // Un bloqueo vencido empieza la cuenta de cero.
    const failed = user.lockedUntil ? 0 : user.failedLogins;
    if (!(await verifySecret(user.passwordHash, input.password))) {
      if (failed + 1 < MAX_FAILED_LOGINS) {
        await tx
          .update(users)
          .set({ failedLogins: failed + 1, lockedUntil: null })
          .where(eq(users.id, user.id));
        return reject(badCredentials(MAX_FAILED_LOGINS - failed - 1));
      }
      const lockedUntil = new Date(now.getTime() + LOCK_MS);
      await tx.update(users).set({ failedLogins: 0, lockedUntil }).where(eq(users.id, user.id));
      await recordAudit(tx, this.clock, {
        userId: user.id,
        deviceId: input.deviceId,
        action: 'auth.locked',
        entityType: 'user',
        entityId: user.id,
        after: { lockedUntil: lockedUntil.toISOString() },
      });
      return reject(lockedError(lockedUntil, now), true);
    }
    if (!user.active)
      return reject(new AppError('FORBIDDEN', 'Este usuario está desactivado. Consulte a una Apoderada.'));
    await tx.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
    const session = await createSession(tx, this.clock, {
      userId: user.id,
      kind: 'app',
      deviceId: input.deviceId,
      deviceLabel: input.deviceLabel,
      platform: input.platform,
      keepSignedIn: input.keepSignedIn,
    });
    await recordAudit(tx, this.clock, {
      userId: user.id,
      sessionId: session.id,
      deviceId: input.deviceId,
      action: 'auth.login',
      entityType: 'session',
      entityId: session.id,
      after: { keepSignedIn: input.keepSignedIn, expiresAt: session.expiresAt.toISOString() },
    });
    const [dto] = await tx.select(userColumns).from(users).where(eq(users.id, user.id));
    return { ok: true, value: { token: session.token, expiresAt: session.expiresAt.toISOString(), user: dto! } };
  }

  @Post('logout')
  @HttpCode(204)
  @Contract({ roles: ALL_ROLES, whileMustChangePassword: true })
  async logout(@Req() req: AuthedRequest): Promise<void> {
    const { sessionId } = req.auth;
    await auditedTransaction(this.db, this.clock, this.entry(req, 'auth.logout', 'session', sessionId), async (tx) => {
      await tx.update(sessions).set({ revokedAt: this.clock.now() }).where(eq(sessions.id, sessionId));
      return { value: undefined };
    });
  }

  @Get('me')
  @Contract({ output: meResponseSchema, roles: ALL_ROLES, whileMustChangePassword: true })
  async me(@Req() req: AuthedRequest): Promise<z.infer<typeof meResponseSchema>> {
    const [user] = await this.db.select(userColumns).from(users).where(eq(users.id, req.auth.userId));
    return { user: user!, permissions: ACTIONS.filter((a) => can(user!.role, a)) };
  }

  @Get('sessions')
  @Contract({ output: sessionsResponseSchema, roles: ALL_ROLES })
  async sessions(@Req() req: AuthedRequest): Promise<z.infer<typeof sessionsResponseSchema>> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(this.ownActive(req.auth.userId))
      .orderBy(desc(sessions.createdAt), desc(sessions.id));
    return rows.map((s) => ({
      id: s.id,
      deviceLabel: s.deviceLabel,
      platform: s.platform,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      current: s.id === req.auth.sessionId,
    }));
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @Contract({ roles: ALL_ROLES })
  async closeSession(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await auditedTransaction(this.db, this.clock, this.entry(req, 'auth.session_closed', 'session', id), async (tx) => {
      const closed = await tx
        .update(sessions)
        .set({ revokedAt: this.clock.now() })
        .where(and(eq(sessions.id, id), this.ownActive(req.auth.userId)))
        .returning({ id: sessions.id });
      if (closed.length === 0) throw new AppError('NOT_FOUND', 'La sesión no existe o ya está cerrada.');
      return { value: undefined };
    });
  }

  /** RF-AUT-07: cierra todas las demás sesiones del usuario. */
  @Delete('sessions')
  @HttpCode(204)
  @Contract({ roles: ALL_ROLES })
  async closeOtherSessions(@Req() req: AuthedRequest): Promise<void> {
    const { sessionId, userId } = req.auth;
    await auditedTransaction(
      this.db,
      this.clock,
      this.entry(req, 'auth.sessions_closed', 'user', userId),
      async (tx) => {
        const closed = await revokeUserSessions(tx, this.clock, userId, sessionId);
        return { value: undefined, after: { closedSessions: closed.length } };
      },
    );
  }

  /** RF-AUT-04: cambiar la contraseña cierra las demás sesiones. */
  @Post('change-password')
  @HttpCode(204)
  @Contract({ input: changePasswordSchema, roles: ALL_ROLES, whileMustChangePassword: true })
  async changePassword(
    @Req() req: AuthedRequest,
    @Body(new ZodValidationPipe(changePasswordSchema)) input: z.output<typeof changePasswordSchema>,
  ): Promise<void> {
    const { sessionId, userId } = req.auth;
    await auditedTransaction(
      this.db,
      this.clock,
      this.entry(req, 'auth.change_password', 'user', userId),
      async (tx) => {
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
        if (!(await verifySecret(user!.passwordHash, input.current)))
          throw new AppError('VALIDATION_ERROR', 'Hay 1 campo por corregir.', {
            fields: { current: 'La contraseña actual no es correcta.' },
          });
        const [dto] = await tx
          .update(users)
          .set({
            passwordHash: await hashSecret(input.password),
            mustChangePassword: false,
            rowVersion: sql`${users.rowVersion} + 1`,
            updatedAt: this.clock.now(),
          })
          .where(eq(users.id, userId))
          .returning(userColumns);
        const closed = await revokeUserSessions(tx, this.clock, userId, sessionId);
        await recordChanges(tx, this.clock, [
          { entityType: 'user', entityId: userId, op: 'upsert', audience: 'apoderada', payload: dto },
        ]);
        return { value: undefined, after: { closedSessions: closed.length } };
      },
    );
  }

  private entry(req: AuthedRequest, action: string, entityType: string, entityId: string) {
    const { sessionId, userId, deviceId } = req.auth;
    return { userId, sessionId, deviceId, action, entityType, entityId };
  }

  private ownActive(userId: string) {
    return and(
      eq(sessions.userId, userId),
      eq(sessions.kind, 'app'),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, this.clock.now()),
    );
  }
}
