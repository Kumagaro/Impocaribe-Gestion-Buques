// T035 · RF-RED-05: dispositivos emparejados y su revocación, solo para Apoderadas. Revocar cierra sus sesiones y le
// avisa (device.revoked); su copia local se borra en la app (RF-AUT-08). Para volver a usarlo hay que emparejarlo.
import { Controller, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { AppError, type Clock } from '@impocaribe/shared';
import { deviceDtoSchema, devicesSchema } from '@impocaribe/shared/validation';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'express';
import type { z } from 'zod';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { devices } from '../db/schema/devices.ts';
import { sessions } from '../db/schema/users.ts';
import { ServerEvents } from '../events/server-events.ts';
import { auditedWrite } from '../http/audited-write.ts';
import { Contract } from '../http/contract.ts';
import { CLOCK, DB } from '../tokens.ts';

type DeviceDto = z.infer<typeof deviceDtoSchema>;
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const toDto = (d: typeof devices.$inferSelect): DeviceDto => ({
  id: d.id,
  name: d.name,
  platform: d.platform,
  pairedAt: d.pairedAt.toISOString(),
  pairedMethod: d.pairedMethod,
  lastSeenAt: iso(d.lastSeenAt),
  revokedAt: iso(d.revokedAt),
});

@Controller('devices')
export class DevicesController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: ServerEvents,
  ) {}

  @Get()
  @Contract({ output: devicesSchema, roles: ['apoderada'] })
  async list(): Promise<DeviceDto[]> {
    return (await this.db.select().from(devices).orderBy(desc(devices.pairedAt))).map(toDto);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @Contract({ output: deviceDtoSchema, roles: ['apoderada'] })
  async revoke(@Req() req: AuthedRequest, @Res() res: Response, @Param('id') id: string): Promise<void> {
    const { userId, sessionId, deviceId } = req.auth;
    const entry = { userId, sessionId, deviceId, action: 'device.revoke', entityType: 'device', entityId: id };
    const result = await auditedWrite(this.db, this.clock, req, entry, async (tx) => {
      const now = this.clock.now();
      const [revoked] = await tx
        .update(devices)
        .set({ revokedAt: now, revokedBy: userId })
        .where(and(eq(devices.id, id), isNull(devices.revokedAt)))
        .returning();
      if (!revoked) throw new AppError('NOT_FOUND', 'El dispositivo no existe o ya está revocado.');
      // Sus sesiones (de la app y de alertas) se cierran con él (RF-RED-05).
      await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.deviceId, id), isNull(sessions.revokedAt)));
      return { status: 200, body: toDto(revoked), after: { revokedAt: now.toISOString() } };
    });
    // Después del COMMIT: el aviso por WebSocket (T043) no debe salir si la revocación se revierte.
    if (result.status === 200) this.events.emit('device.revoked', { deviceId: id });
    res.status(result.status).json(result.body);
  }
}
