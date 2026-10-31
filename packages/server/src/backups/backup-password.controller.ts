// T105 · RF-RES-04, 08, DT-07, plan §6.2: la contraseña de respaldo, solo para Apoderadas. Definirla crea el par de
// claves; cambiarla exige la actual y vuelve a sellar la misma clave privada; confirmarla (cada 90 días) es comprobar
// que abre la clave privada. Ninguna contraseña entra en la bitácora ni en la huella de idempotencia.
import { Body, Controller, Get, HttpCode, Inject, Post, Put, Req, Res } from '@nestjs/common';
import {
  AppError,
  confirmationDue,
  MAX_POSTPONES,
  POSTPONE_MS,
  postponesLeft,
  type BackupPasswordState,
  type Clock,
} from '@impocaribe/shared';
import {
  backupPasswordSchema,
  backupPasswordStatusSchema,
  setBackupPasswordSchema,
  type BackupPasswordStatus,
} from '@impocaribe/shared/validation';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'express';
import type { z } from 'zod';
import type { Tx } from '../audit/audit-log.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { systemSettings } from '../db/schema/company.ts';
import { auditedWrite } from '../http/audited-write.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DB } from '../tokens.ts';
import { newKeyPair, openPrivateKey, sealPrivateKey, type SealedKey } from './crypto.ts';

const A = ['apoderada'] as const;

type Row = typeof systemSettings.$inferSelect;
export const passwordState = (r: Row): BackupPasswordState => ({
  setAt: r.backupPasswordSetAt,
  confirmedAt: r.backupPasswordConfirmedAt,
  postpones: r.backupConfirmPostpones,
  postponedUntil: r.backupConfirmPostponedUntil,
});

export function statusOf(r: Row, now: Date): BackupPasswordStatus {
  const s = passwordState(r);
  return {
    defined: r.backupPrivateKey !== null,
    setAt: s.setAt?.toISOString() ?? null,
    confirmedAt: s.confirmedAt?.toISOString() ?? null,
    due: confirmationDue(s, now),
    postponesLeft: postponesLeft(s),
  };
}

@Controller('backups/password')
export class BackupPasswordController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  @Contract({ output: backupPasswordStatusSchema, roles: A })
  async status(): Promise<BackupPasswordStatus> {
    const [row] = await this.db.select().from(systemSettings);
    return statusOf(row!, this.clock.now());
  }

  /** Definirla la primera vez (crea el par de claves) o cambiarla con la actual. Cuenta como confirmada. */
  @Put()
  @Contract({
    input: setBackupPasswordSchema,
    output: backupPasswordStatusSchema,
    errors: ['BACKUP_PASSWORD_INVALID'],
    roles: A,
  })
  async set(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(setBackupPasswordSchema)) input: z.output<typeof setBackupPasswordSchema>,
  ) {
    await this.write(req, res, 'backup.password', async (tx, row) => {
      const now = this.clock.now();
      const sealed = row.backupPrivateKey as SealedKey | null;
      let publicKey = row.backupPublicKey;
      let privateKey;
      if (sealed) {
        if (!input.current)
          throw new AppError('BACKUP_PASSWORD_INVALID', 'Escriba la contraseña de respaldo actual.', {
            fields: { current: 'Escriba la contraseña de respaldo actual.' },
          });
        privateKey = await openPrivateKey(sealed, input.current).catch(() => {
          throw new AppError('BACKUP_PASSWORD_INVALID', 'La contraseña de respaldo actual no es correcta.', {
            fields: { current: 'La contraseña de respaldo actual no es correcta.' },
          });
        });
      } else {
        const pair = newKeyPair();
        publicKey = pair.publicKey;
        privateKey = pair.privateKey;
      }
      await tx.update(systemSettings).set({
        backupPublicKey: publicKey,
        backupPrivateKey: await sealPrivateKey(privateKey, input.password),
        backupPasswordSetAt: now,
        backupPasswordConfirmedAt: now,
        backupConfirmPostpones: 0,
        backupConfirmPostponedUntil: null,
        updatedAt: now,
      });
      return { before: { defined: sealed !== null }, after: { defined: true, changed: sealed !== null } };
    });
  }

  /** RF-RES-08: confirmarla; si no abre la clave privada, BACKUP_PASSWORD_INVALID (y queda el rechazo en la bitácora). */
  @Post('confirm')
  @HttpCode(200)
  @Contract({
    input: backupPasswordSchema,
    output: backupPasswordStatusSchema,
    errors: ['BACKUP_PASSWORD_INVALID'],
    roles: A,
  })
  async confirm(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(backupPasswordSchema)) input: z.output<typeof backupPasswordSchema>,
  ) {
    await this.write(req, res, 'backup.password.confirm', async (tx, row) => {
      if (!row.backupPrivateKey)
        throw new AppError('VALIDATION_ERROR', 'Todavía no hay contraseña de respaldo: defínala en Respaldos.');
      await openPrivateKey(row.backupPrivateKey as SealedKey, input.password);
      await tx.update(systemSettings).set({
        backupPasswordConfirmedAt: this.clock.now(),
        backupConfirmPostpones: 0,
        backupConfirmPostponedUntil: null,
      });
      return {};
    });
  }

  /** «Recordármelo mañana», hasta 3 veces. */
  @Post('postpone')
  @HttpCode(200)
  @Contract({ output: backupPasswordStatusSchema, roles: A })
  async postpone(@Req() req: AuthedRequest, @Res() res: Response) {
    await this.write(req, res, 'backup.password.postpone', async (tx, row) => {
      if (row.backupConfirmPostpones >= MAX_POSTPONES)
        throw new AppError(
          'VALIDATION_ERROR',
          `Ya se aplazó ${MAX_POSTPONES} veces: escriba la contraseña de respaldo para confirmarla.`,
        );
      await tx.update(systemSettings).set({
        backupConfirmPostpones: row.backupConfirmPostpones + 1,
        backupConfirmPostponedUntil: new Date(this.clock.now().getTime() + POSTPONE_MS),
      });
      return { after: { postpones: row.backupConfirmPostpones + 1 } };
    });
  }

  private async write(
    req: AuthedRequest,
    res: Response,
    action: string,
    fn: (tx: Tx, row: Row) => Promise<{ before?: unknown; after?: unknown }>,
  ) {
    const { sessionId, userId, deviceId } = req.auth;
    const result = await auditedWrite(
      this.db,
      this.clock,
      req,
      { userId, sessionId, deviceId, action, entityType: 'settings' },
      async (tx) => {
        const [row] = await tx.select().from(systemSettings).for('update');
        const audit = await fn(tx, row!);
        const [after] = await tx.select().from(systemSettings);
        return { status: 200, body: statusOf(after!, this.clock.now()), ...audit };
      },
    );
    res.status(result.status).json(result.body);
  }
}
