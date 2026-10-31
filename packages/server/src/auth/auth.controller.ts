// T029 · RF-AUT-01 a 07 y 10, plan §6.2: inicio de sesión, sesiones propias y cambio de contraseña.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { ACTIONS, AppError, can, type Clock } from '@impocaribe/shared';
import {
  changePasswordSchema,
  deviceTokenResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  meResponseSchema,
  sessionsResponseSchema,
} from '@impocaribe/shared/validation';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'express';
import type { z } from 'zod';
import { auditedTransaction, recordAudit, recordRejected, type Tx } from '../audit/audit-log.ts';
import { sessions, users } from '../db/schema/users.ts';
import { auditedWrite } from '../http/audited-write.ts';
import type { DeviceRequest } from '../http/device.guard.ts';
import { Contract } from '../http/contract.ts';
import { idempotencyRequest, withIdempotency, type WriteResult } from '../http/idempotency.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DB } from '../tokens.ts';
import { recordUserChange, userColumns } from '../users/users.repo.ts';
import { activeLock, badCredentials, registerFailure } from './lockout.ts';
import { hashSecret, verifySecret } from './password.ts';
import type { AuthedRequest } from './session.guard.ts';
import { createSession, revokeDeviceTokens, revokeUserSessions } from './sessions.ts';

export const ALL_ROLES = ['apoderada', 'operador', 'lectura'] as const;
export { MAX_FAILED_LOGINS } from './lockout.ts';
/** Un hash cualquiera para gastar el mismo tiempo cuando el usuario no existe: el tiempo no revela qué usuarios hay. */
const DECOY = hashSecret('impocaribe-decoy');

type LoginRequest = z.output<typeof loginRequestSchema>;
type LoginResponse = z.infer<typeof loginResponseSchema>;
/** Resultado de la transacción del login: un rechazo se responde después del COMMIT, para que el contador quede. */
type LoginOutcome =
  { ok: true; value: LoginResponse } | { ok: false; error: AppError; userId?: string; audited: boolean };

/** Responde una escritura idempotente: 204 sin cuerpo, o el estado y el cuerpo guardados. */
function send(res: Response, result: WriteResult): void {
  if (result.body === null || result.body === undefined) res.status(result.status).end();
  else res.status(result.status).json(result.body);
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * La respuesta lleva el token en claro, así que no se guarda para la idempotencia (plan §6, DT-22): repetir el login
   * abre otra sesión, que no tiene efecto de negocio y caduca sola.
   */
  @Post('login')
  @HttpCode(200)
  @Contract({ input: loginRequestSchema, output: loginResponseSchema, roles: 'public' })
  async login(
    @Req() req: DeviceRequest,
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
  ): Promise<LoginResponse> {
    // La sesión queda ligada al dispositivo verificado por su firma (DT-24), no al que diga el cuerpo.
    const input = { ...body, deviceId: req.device?.id ?? body.deviceId };
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
    const lock = activeLock(user, now);
    if (lock) return reject(lock);
    if (!(await verifySecret(user.passwordHash, input.password))) {
      const failure = await registerFailure(tx, this.clock, user, input.deviceId);
      return 'locked' in failure ? reject(failure.locked, true) : reject(badCredentials(failure.remaining));
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
    // P-21: el último acceso de la ficha cambia con cada inicio de sesión.
    await recordUserChange(tx, this.clock, dto!);
    return { ok: true, value: { token: session.token, expiresAt: session.expiresAt.toISOString(), user: dto! } };
  }

  /** Cierra esta sesión y, con ella, el token de alertas de este dispositivo (DT-05, RF-AUT-08). */
  @Post('logout')
  @HttpCode(204)
  @Contract({ roles: ALL_ROLES, whileMustChangePassword: true })
  async logout(@Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    const { sessionId, userId, deviceId } = req.auth;
    const entry = this.entry(req, 'auth.logout', 'session', sessionId);
    send(
      res,
      await auditedWrite(this.db, this.clock, req, entry, async (tx) => {
        await tx.update(sessions).set({ revokedAt: this.clock.now() }).where(eq(sessions.id, sessionId));
        await revokeDeviceTokens(tx, this.clock, userId, deviceId);
        return { status: 204, body: null };
      }),
    );
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

  /** RF-AUT-07: cierra una sesión propia y el token de alertas de su dispositivo. */
  @Delete('sessions/:id')
  @HttpCode(204)
  @Contract({ roles: ALL_ROLES })
  async closeSession(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const { userId } = req.auth;
    send(
      res,
      await auditedWrite(
        this.db,
        this.clock,
        req,
        this.entry(req, 'auth.session_closed', 'session', id),
        async (tx) => {
          const [closed] = await tx
            .update(sessions)
            .set({ revokedAt: this.clock.now() })
            .where(and(eq(sessions.id, id), this.ownActive(userId)))
            .returning({ deviceId: sessions.deviceId });
          if (!closed) throw new AppError('NOT_FOUND', 'La sesión no existe o ya está cerrada.');
          await revokeDeviceTokens(tx, this.clock, userId, closed.deviceId);
          return { status: 204, body: null };
        },
      ),
    );
  }

  /** RF-AUT-07: cierra todas las demás sesiones del usuario; este dispositivo conserva la suya y sus alertas. */
  @Delete('sessions')
  @HttpCode(204)
  @Contract({ roles: ALL_ROLES })
  async closeOtherSessions(@Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    const { sessionId, userId, deviceId } = req.auth;
    send(
      res,
      await auditedWrite(
        this.db,
        this.clock,
        req,
        this.entry(req, 'auth.sessions_closed', 'user', userId),
        async (tx) => {
          const closed = await revokeUserSessions(tx, this.clock, userId, { sessionId, deviceId });
          return { status: 204, body: null, after: { closedSessions: closed.length } };
        },
      ),
    );
  }

  /**
   * RF-AUT-04: cambiar la contraseña cierra las demás sesiones. Una contraseña actual equivocada cuenta como intento
   * fallido (RF-AUT-05): el contador y el rechazo se confirman en la base aunque la respuesta sea un error.
   */
  @Post('change-password')
  @HttpCode(204)
  @Contract({ input: changePasswordSchema, roles: ALL_ROLES, whileMustChangePassword: true })
  async changePassword(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(changePasswordSchema)) input: z.output<typeof changePasswordSchema>,
  ): Promise<void> {
    const { sessionId, userId, deviceId } = req.auth;
    const entry = this.entry(req, 'auth.change_password', 'user', userId);
    const result = await withIdempotency(this.db, this.clock, idempotencyRequest(req), async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
      const refuse = async (error: AppError): Promise<WriteResult> => {
        await recordRejected(tx, this.clock, entry, error);
        return { status: error.status, body: error.toBody() };
      };
      const lock = activeLock(user!, this.clock.now());
      if (lock) return refuse(lock);
      if (!(await verifySecret(user!.passwordHash, input.current))) {
        const failure = await registerFailure(tx, this.clock, user!, deviceId);
        if ('locked' in failure) return refuse(failure.locked);
        return refuse(
          new AppError('VALIDATION_ERROR', 'Hay 1 campo por corregir.', {
            fields: { current: 'La contraseña actual no es correcta.' },
          }),
        );
      }
      const [dto] = await tx
        .update(users)
        .set({
          passwordHash: await hashSecret(input.password),
          mustChangePassword: false,
          failedLogins: 0,
          rowVersion: sql`${users.rowVersion} + 1`,
          updatedAt: this.clock.now(),
        })
        .where(eq(users.id, userId))
        .returning(userColumns);
      const closed = await revokeUserSessions(tx, this.clock, userId, { sessionId, deviceId });
      await recordUserChange(tx, this.clock, dto!);
      await recordAudit(tx, this.clock, { ...entry, after: { closedSessions: closed.length } });
      return { status: 204, body: null };
    });
    send(res, result);
  }

  /**
   * DT-05: token de alertas para el servicio nativo de Android; vence con esta sesión y reemplaza al anterior. Lleva
   * el token en claro, así que no se guarda para la idempotencia: repetirlo solo reemplaza el token.
   */
  @Post('device-token')
  @HttpCode(201)
  @Contract({ output: deviceTokenResponseSchema, roles: ALL_ROLES })
  async deviceToken(@Req() req: AuthedRequest): Promise<z.infer<typeof deviceTokenResponseSchema>> {
    const { sessionId, userId, deviceId } = req.auth;
    return auditedTransaction(
      this.db,
      this.clock,
      this.entry(req, 'auth.device_token', 'session', sessionId),
      async (tx) => {
        // FOR UPDATE: dos peticiones a la vez se hacen una tras otra y la segunda reemplaza el token de la primera.
        const [app] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).for('update');
        await revokeDeviceTokens(tx, this.clock, userId, deviceId);
        const issued = await createSession(
          tx,
          this.clock,
          {
            userId,
            kind: 'device',
            deviceId,
            deviceLabel: app!.deviceLabel,
            platform: app!.platform,
            keepSignedIn: app!.keepSignedIn,
          },
          app!.expiresAt,
        );
        return { value: { token: issued.token, expiresAt: issued.expiresAt.toISOString() }, entityId: issued.id };
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
