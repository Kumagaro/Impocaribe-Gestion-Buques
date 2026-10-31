// T107 · RF-RES-03, plan §6.2: restaurar un respaldo, solo Apoderadas, con la contraseña de respaldo y «RESTAURAR».
// No pasa por la idempotencia guardada (esa tabla también se restaura): la protegen la contraseña y la palabra. Al
// terminar, todas las sesiones quedan revocadas, también la de quien restauró.
import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { AppError } from '@impocaribe/shared';
import {
  confirmNumberingSchema,
  numberingStatusSchema,
  restoreResultSchema,
  restoreSchema,
  type NumberingStatus,
  type RestoreResult,
} from '@impocaribe/shared/validation';
import { asc, eq } from 'drizzle-orm';
import type { Response } from 'express';
import type { z } from 'zod';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { systemSettings } from '../db/schema/company.ts';
import { vessels } from '../db/schema/vessels.ts';
import { auditedWrite } from '../http/audited-write.ts';
import { Contract } from '../http/contract.ts';
import { replicate } from '../vessels/vessels.repo.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { Maintenance } from './maintenance.ts';
import { restoreBackup } from './restore.ts';
import { BackupScheduler } from './scheduler.ts';

const A = ['apoderada'] as const;

@Controller('restores')
export class RestoresController {
  constructor(
    private readonly scheduler: BackupScheduler,
    private readonly maintenance: Maintenance,
  ) {}

  /** T108: si hace falta confirmar la numeración y los buques abiertos con su último número restaurado. */
  @Get('numbering')
  @Contract({ output: numberingStatusSchema, roles: A })
  async numbering(): Promise<NumberingStatus> {
    const { db } = this.scheduler.deps;
    const [settings] = await db.select().from(systemSettings);
    const open = await db
      .select({ id: vessels.id, name: vessels.name, code: vessels.code, lastOrderSeq: vessels.lastOrderSeq })
      .from(vessels)
      .where(eq(vessels.status, 'open'))
      .orderBy(asc(vessels.name));
    return { required: settings!.numberingConfirmationRequired, vessels: open };
  }

  /** T108 · RF-RES-03 (7): el último número impreso de cada buque abierto; el contador toma el mayor y se reabre la emisión. */
  @Post('numbering')
  @HttpCode(200)
  @Contract({ input: confirmNumberingSchema, output: numberingStatusSchema, roles: A })
  async confirmNumbering(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(confirmNumberingSchema)) input: z.output<typeof confirmNumberingSchema>,
  ) {
    const { db, clock } = this.scheduler.deps;
    const { userId, sessionId, deviceId } = req.auth;
    const result = await auditedWrite(
      db,
      clock,
      req,
      { userId, sessionId, deviceId, action: 'backup.numbering', entityType: 'settings' },
      async (tx) => {
        const open = await tx.select().from(vessels).where(eq(vessels.status, 'open')).for('update');
        const fields: Record<string, string> = {};
        open.forEach((v) => {
          const i = input.vessels.findIndex((x) => x.vesselId === v.id);
          if (i < 0) fields[`vessels.${v.id}`] = `Falta el último número impreso de ${v.name}.`;
          else if (input.vessels[i]!.lastPrinted < v.lastOrderSeq)
            fields[`vessels.${i}.lastPrinted`] =
              `Debe ser al menos ${v.lastOrderSeq}, el último número restaurado de ${v.name}.`;
        });
        if (Object.keys(fields).length)
          throw new AppError('VALIDATION_ERROR', `Hay ${Object.keys(fields).length} campo(s) por corregir.`, {
            fields,
          });
        for (const v of open) {
          const printed = input.vessels.find((x) => x.vesselId === v.id)!.lastPrinted;
          await tx
            .update(vessels)
            .set({
              lastOrderSeq: Math.max(v.lastOrderSeq, printed),
              rowVersion: v.rowVersion + 1,
              updatedAt: clock.now(),
            })
            .where(eq(vessels.id, v.id));
        }
        await tx.update(systemSettings).set({ numberingConfirmationRequired: false });
        await replicate(tx, clock, { vessels: open.map((v) => v.id) });
        return {
          status: 200,
          body: { required: false, vessels: [] },
          before: open.map((v) => ({ vessel: v.name, lastOrderSeq: v.lastOrderSeq })),
          after: input.vessels,
        };
      },
    );
    res.status(result.status).json(result.body);
  }

  @Post()
  @HttpCode(200)
  @Contract({
    input: restoreSchema,
    output: restoreResultSchema,
    errors: ['BACKUP_PASSWORD_INVALID', 'RESTORE_IN_PROGRESS'],
    roles: A,
  })
  restore(
    @Req() req: AuthedRequest,
    @Body(new ZodValidationPipe(restoreSchema)) input: z.output<typeof restoreSchema>,
  ): Promise<RestoreResult> {
    const { userId, sessionId, deviceId } = req.auth;
    return restoreBackup(
      { ...this.scheduler.deps, maintenance: this.maintenance },
      { backupId: input.backupId, password: input.password },
      { userId, sessionId, deviceId },
    );
  }
}
