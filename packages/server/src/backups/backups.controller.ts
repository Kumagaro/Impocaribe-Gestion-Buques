// T106 · RF-RES-01, 02, plan §6.2: la lista de respaldos y el respaldo manual, solo para Apoderadas.
import { Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { backupDtoSchema, type BackupDto } from '@impocaribe/shared/validation';
import { desc, eq } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { recordAudit } from '../audit/audit-log.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { backups } from '../db/schema/backups.ts';
import { users } from '../db/schema/users.ts';
import { Contract } from '../http/contract.ts';
import { noPassword, runBackup, type BackupRow } from './backup.ts';
import { BackupScheduler } from './scheduler.ts';

const A = ['apoderada'] as const;
const LIST = 200;

export const backupDto = (r: BackupRow, createdByName: string | null): BackupDto => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  startedAt: r.startedAt.toISOString(),
  finishedAt: r.finishedAt?.toISOString() ?? null,
  available: r.filePath !== null,
  sizeBytes: r.sizeBytes,
  sha256: r.sha256,
  error: r.error,
  externalPath: r.externalPath,
  externalCopiedAt: r.externalCopiedAt?.toISOString() ?? null,
  createdByName,
});

@Controller('backups')
export class BackupsController {
  constructor(private readonly scheduler: BackupScheduler) {}

  @Get()
  @Contract({ output: z.array(backupDtoSchema), roles: A })
  async list(): Promise<BackupDto[]> {
    const rows = await this.scheduler.deps.db
      .select({ b: backups, name: users.fullName })
      .from(backups)
      .leftJoin(users, eq(users.id, backups.createdBy))
      .orderBy(desc(backups.startedAt))
      .limit(LIST);
    return rows.map((r) => backupDto(r.b, r.name));
  }

  /** RF-RES-02: un respaldo ahora. Responde cuando termina (bien o mal: queda registrado y, si falla, AL-12). */
  @Post()
  @HttpCode(201)
  @Contract({ output: backupDtoSchema, roles: A })
  async manual(@Req() req: AuthedRequest, @Res() res: Response) {
    const { db, clock } = this.scheduler.deps;
    const row = await runBackup(this.scheduler.deps, 'manual', req.auth.userId);
    if (!row) throw noPassword();
    await recordAudit(db, clock, {
      userId: req.auth.userId,
      sessionId: req.auth.sessionId,
      deviceId: req.auth.deviceId,
      action: 'backup.manual',
      entityType: 'backup',
      entityId: row.id,
      after: { status: row.status, sizeBytes: row.sizeBytes, error: row.error },
    });
    const [name] = await db.select({ name: users.fullName }).from(users).where(eq(users.id, req.auth.userId));
    res.status(201).json(backupDto(row, name?.name ?? null));
  }
}
