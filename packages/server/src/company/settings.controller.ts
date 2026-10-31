// T052 · RF-CFG-01, 02 y 04: configuración del sistema y cambio del código de instalación, solo Apoderadas. Cada cambio
// queda en la bitácora con el valor anterior y el nuevo; los códigos de instalación, nunca.
import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Req, Res } from '@nestjs/common';
import { AppError, type Clock } from '@impocaribe/shared';
import {
  DEFAULT_LEGAL_NOTICE,
  editSettingsSchema,
  installationCodeChangeSchema,
  settingsDtoSchema,
  type SettingsDto,
} from '@impocaribe/shared/validation';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import type { Tx } from '../audit/audit-log.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { hashSecret, verifySecret } from '../auth/password.ts';
import { systemSettings } from '../db/schema/company.ts';
import { updateVersioned } from '../db/versioned.ts';
import { auditedWrite } from '../http/audited-write.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DB } from '../tokens.ts';

const A = ['apoderada'] as const;

/** El DTO a partir de la fila: las horas en hh:mm y el aviso por defecto si nadie lo cambió. */
export function settingsDto(row: typeof systemSettings.$inferSelect): SettingsDto {
  return {
    maxLoadingDaysAhead: row.maxLoadingDaysAhead,
    workdayStart: row.workdayStart.slice(0, 5),
    workdayEnd: row.workdayEnd.slice(0, 5),
    dailyBackupHour: row.dailyBackupHour.slice(0, 5),
    externalBackupDir: row.externalBackupDir,
    networkSetup: row.networkSetup,
    deadlineLegalNotice: row.deadlineLegalNotice ?? DEFAULT_LEGAL_NOTICE,
    rowVersion: row.rowVersion,
  };
}

/** RF-CFG-02: la carpeta debe existir en la PC servidor y admitir escritura (se prueba escribiendo). */
async function backupDirIssue(dir: string): Promise<string | null> {
  let info;
  try {
    info = await stat(dir);
  } catch {
    return 'La carpeta no existe en la PC servidor. Conecte la memoria USB o elija otra.';
  }
  if (!info.isDirectory()) return 'La ruta es un archivo, no una carpeta.';
  const probe = join(dir, `.impocaribe-${randomUUID()}.tmp`);
  try {
    await writeFile(probe, '');
    await unlink(probe);
    return null;
  } catch {
    return 'La PC servidor no puede escribir en esa carpeta. Compruebe que la memoria USB no esté protegida contra escritura.';
  }
}

@Controller('settings')
export class SettingsController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  @Contract({ output: settingsDtoSchema, roles: A })
  async get(): Promise<SettingsDto> {
    const [row] = await this.db.select().from(systemSettings);
    return settingsDto(row!);
  }

  @Patch()
  @Contract({ input: editSettingsSchema, output: settingsDtoSchema, errors: ['STALE_RECORD'], roles: A })
  async edit(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(editSettingsSchema)) input: z.output<typeof editSettingsSchema>,
  ): Promise<void> {
    const { expectedVersion, ...values } = input;
    const result = await auditedWrite(this.db, this.clock, req, this.entry(req, 'settings.edit'), async (tx) => {
      const before = await this.locked(tx);
      // Solo si cambió: con la memoria USB desconectada se pueden seguir cambiando los demás parámetros.
      if (values.externalBackupDir !== before.externalBackupDir) {
        const issue = await backupDirIssue(values.externalBackupDir);
        if (issue)
          throw new AppError('VALIDATION_ERROR', 'Hay 1 campo por corregir.', { fields: { externalBackupDir: issue } });
      }
      const row = await updateVersioned(tx, systemSettings, 1, expectedVersion, {
        ...values,
        updatedAt: this.clock.now(),
      });
      // RF-CFG-01: en la bitácora, los valores anteriores completos (sin la versión) y los nuevos.
      return { status: 200, body: settingsDto(row), before: { ...before, rowVersion: undefined }, after: values };
    });
    res.status(result.status).json(result.body);
  }

  @Post('installation-code')
  @HttpCode(204)
  @Contract({ input: installationCodeChangeSchema, errors: ['INSTALL_CODE_INVALID'], roles: A })
  async changeInstallationCode(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(installationCodeChangeSchema)) input: z.output<typeof installationCodeChangeSchema>,
  ): Promise<void> {
    const result = await auditedWrite(
      this.db,
      this.clock,
      req,
      this.entry(req, 'settings.installation_code'),
      async (tx) => {
        const [row] = await tx.select({ hash: systemSettings.installationCodeHash }).from(systemSettings).for('update');
        if (!row!.hash)
          throw new AppError(
            'INSTALL_CODE_INVALID',
            'Este servidor aún no tiene código de instalación: lo guarda el ayudante de instalación al crear el servidor.',
          );
        if (!(await verifySecret(row!.hash, input.currentCode)))
          throw new AppError('INSTALL_CODE_INVALID', 'El código de instalación actual no es correcto.');
        await tx
          .update(systemSettings)
          .set({ installationCodeHash: await hashSecret(input.newCode), updatedAt: this.clock.now() });
        return { status: 204, body: null };
      },
    );
    res.status(result.status).end();
  }

  private async locked(tx: Tx): Promise<SettingsDto> {
    const [row] = await tx.select().from(systemSettings).for('update');
    return settingsDto(row!);
  }

  private entry(req: AuthedRequest, action: string) {
    const { sessionId, userId, deviceId } = req.auth;
    return { userId, sessionId, deviceId, action, entityType: 'settings' };
  }
}
