// T031 · RF-USR-02 a 04, RF-REC-06, RF-AUT-04 y 10: gestión de usuarios, solo para Apoderadas (spec §2).
import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Req, Res } from '@nestjs/common';
import { AppError, type Clock, type Role } from '@impocaribe/shared';
import {
  editUserSchema,
  newUserSchema,
  resetPasswordSchema,
  setupResponseSchema,
  userDtoSchema,
  userListSchema,
} from '@impocaribe/shared/validation';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'express';
import type { z } from 'zod';
import { auditedTransaction, type Tx } from '../audit/audit-log.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { hashSecret } from '../auth/password.ts';
import { revokeUserSessions } from '../auth/sessions.ts';
import { sessions, users } from '../db/schema/users.ts';
import { updateVersioned } from '../db/versioned.ts';
import { auditedWrite } from '../http/audited-write.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DB } from '../tokens.ts';
import { issueRecoveryCodes } from './recovery-codes.ts';
import { createUser, recordUserChange, uniqueViolation, userColumns, type UserDto } from './users.repo.ts';

const A = ['apoderada'] as const;

const lastApoderada = () =>
  new AppError(
    'LAST_APODERADA',
    'No se puede desactivar ni cambiar de rol a la última Apoderada activa. Cree o active otra Apoderada antes.',
  );

@Controller('users')
export class UsersController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  @Contract({ output: userListSchema, roles: A })
  async list(): Promise<z.infer<typeof userListSchema>> {
    const rows = await this.db
      .select({
        ...userColumns,
        lastAccessAt: sql<Date | null>`max(${sessions.lastSeenAt})`.mapWith((v) => (v ? new Date(v) : null)),
      })
      .from(users)
      .leftJoin(sessions, eq(sessions.userId, users.id))
      .groupBy(users.id)
      .orderBy(asc(users.fullName), asc(users.username));
    return rows.map((r) => ({ ...r, lastAccessAt: r.lastAccessAt ? r.lastAccessAt.toISOString() : null }));
  }

  /** Alta con su juego de códigos, que se muestran una sola vez (RF-REC-01). No se guarda la respuesta: lleva los códigos. */
  @Post()
  @HttpCode(201)
  @Contract({ input: newUserSchema, output: setupResponseSchema, errors: ['DUPLICATE_NATIONAL_ID'], roles: A })
  async create(
    @Req() req: AuthedRequest,
    @Body(new ZodValidationPipe(newUserSchema)) input: z.output<typeof newUserSchema>,
  ): Promise<z.infer<typeof setupResponseSchema>> {
    return auditedTransaction(this.db, this.clock, this.entry(req, 'user.create'), async (tx) => {
      const user = await createUser(tx, this.clock, input);
      const recoveryCodes = await issueRecoveryCodes(tx, this.clock, user.id);
      await this.replicate(tx, user);
      return { value: { user, recoveryCodes }, entityId: user.id, after: user };
    });
  }

  @Patch(':id')
  @Contract({
    input: editUserSchema,
    output: userDtoSchema,
    errors: ['DUPLICATE_NATIONAL_ID', 'LAST_APODERADA', 'STALE_RECORD'],
    roles: A,
  })
  async edit(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editUserSchema)) input: z.output<typeof editUserSchema>,
  ): Promise<void> {
    const { expectedVersion, ...values } = input;
    await this.write(req, res, 'user.edit', id, async (tx, before) => {
      if (before.role === 'apoderada' && values.role !== 'apoderada') await this.assertAnotherApoderada(tx, id);
      await updateVersioned(tx, users, id, expectedVersion, {
        ...values,
        updatedAt: this.clock.now(),
      }).catch((err: unknown) => uniqueViolation(err, values));
      // RF-AUT-10: un cambio de rol cierra todas sus sesiones.
      if (before.role !== values.role) await revokeUserSessions(tx, this.clock, id);
      // Solo las columnas públicas: nunca el hash ni los contadores de seguridad (plan §9).
      const [dto] = await tx.select(userColumns).from(users).where(eq(users.id, id));
      return dto!;
    });
  }

  @Post(':id/deactivate')
  @Contract({ output: userDtoSchema, errors: ['LAST_APODERADA'], roles: A })
  async deactivate(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    await this.write(req, res, 'user.deactivate', id, async (tx, before) => {
      if (before.role === 'apoderada' && before.active) await this.assertAnotherApoderada(tx, id);
      // RF-AUT-04: desactivar cierra todas sus sesiones.
      await revokeUserSessions(tx, this.clock, id);
      return this.update(tx, id, { active: false });
    });
  }

  @Post(':id/activate')
  @Contract({ output: userDtoSchema, roles: A })
  async activate(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    await this.write(req, res, 'user.activate', id, (tx) => this.update(tx, id, { active: true }));
  }

  /** RF-REC-06: contraseña temporal que deberá cambiar en su próximo ingreso; cierra sus sesiones (RF-AUT-04). */
  @Post(':id/reset-password')
  @Contract({ input: resetPasswordSchema, output: userDtoSchema, roles: A })
  async resetPassword(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) input: z.output<typeof resetPasswordSchema>,
  ): Promise<void> {
    await this.write(req, res, 'user.reset_password', id, async (tx) => {
      await revokeUserSessions(tx, this.clock, id);
      return this.update(tx, id, {
        passwordHash: await hashSecret(input.password),
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
      });
    });
  }

  /** Lee y bloquea al usuario, aplica el cambio, lo replica y lo deja en la bitácora, con idempotencia (DT-22). */
  private async write(
    req: AuthedRequest,
    res: Response,
    action: string,
    id: string,
    fn: (tx: Tx, before: UserDto) => Promise<UserDto>,
  ): Promise<void> {
    const result = await auditedWrite(this.db, this.clock, req, this.entry(req, action, id), async (tx) => {
      // Orden fijo: el bloqueo de las Apoderadas antes que el de la fila, para que dos cambios cruzados no se esperen
      // en círculo (DT-09).
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('impocaribe.apoderadas'))`);
      const [before] = await tx.select(userColumns).from(users).where(eq(users.id, id)).for('update');
      if (!before) throw new AppError('NOT_FOUND', 'El usuario no existe.');
      const after = await fn(tx, before);
      await this.replicate(tx, after);
      return { status: 200, body: after, entityId: id, before, after };
    });
    res.status(result.status).json(result.body);
  }

  /** RF-USR-04: debe quedar al menos otra Apoderada activa. */
  private async assertAnotherApoderada(tx: Tx, exceptId: string): Promise<void> {
    const [other] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'apoderada' satisfies Role), eq(users.active, true), ne(users.id, exceptId)))
      .limit(1);
    if (!other) throw lastApoderada();
  }

  private async update(tx: Tx, id: string, values: Partial<typeof users.$inferInsert>): Promise<UserDto> {
    const [user] = await tx
      .update(users)
      .set({ ...values, rowVersion: sql`${users.rowVersion} + 1`, updatedAt: this.clock.now() })
      .where(eq(users.id, id))
      .returning(userColumns);
    return user!;
  }

  private replicate(tx: Tx, user: UserDto) {
    return recordUserChange(tx, this.clock, user);
  }

  private entry(req: AuthedRequest, action: string, entityId?: string) {
    const { sessionId, userId, deviceId } = req.auth;
    return { userId, sessionId, deviceId, action, entityType: 'user', ...(entityId ? { entityId } : {}) };
  }
}
