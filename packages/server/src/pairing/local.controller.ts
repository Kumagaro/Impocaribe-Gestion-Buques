// T035 · plan §6.2 (Administración local) y §9: lo que solo se hace ante la PC servidor. Quien está ahí confirma o
// rechaza los emparejamientos (RF-RED-04, sin sesión) y genera el QR; la app de la propia PC servidor se empareja sola.
import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AppError, type Clock } from '@impocaribe/shared';
import {
  pairedDeviceSchema,
  pendingPairingsSchema,
  qrResponseSchema,
  selfPairSchema,
} from '@impocaribe/shared/validation';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';
import { auditedTransaction } from '../audit/audit-log.ts';
import { pairingQrTokens, pairingRequests } from '../db/schema/devices.ts';
import type { ServerInfo } from '../discovery/discovery.controller.ts';
import { Contract } from '../http/contract.ts';
import { localOnlyGuard } from '../http/local-only.guard.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DB, SERVER_INFO } from '../tokens.ts';
import {
  hashQrToken,
  PAIRING_TTL_MS,
  pairingExpired,
  randomToken,
  registerDevice,
  requireIdentity,
} from './pairing.controller.ts';

@Controller('local')
@UseGuards(localOnlyGuard('Solo se puede hacer desde la propia PC servidor.'))
export class LocalController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SERVER_INFO) private readonly info: ServerInfo | null,
  ) {}

  /** Solicitudes pendientes y vigentes, con el código que la persona compara con el del dispositivo. */
  @Get('pairing')
  @Contract({ output: pendingPairingsSchema, roles: 'public' })
  async pending(): Promise<z.infer<typeof pendingPairingsSchema>> {
    const rows = await this.db
      .select()
      .from(pairingRequests)
      .where(and(eq(pairingRequests.status, 'pending'), gt(pairingRequests.expiresAt, this.clock.now())))
      .orderBy(asc(pairingRequests.createdAt));
    return rows.map((r) => ({
      id: r.id,
      deviceName: r.deviceName,
      platform: r.platform,
      code: r.code,
      expiresAt: r.expiresAt.toISOString(),
    }));
  }

  @Post('pairing/:id/confirm')
  @HttpCode(200)
  @Contract({ errors: ['PAIRING_EXPIRED'], roles: 'public' })
  async confirm(@Param('id', ParseUUIDPipe) id: string): Promise<{ deviceId: string }> {
    return auditedTransaction(this.db, this.clock, { action: 'device.pair', entityType: 'device' }, async (tx) => {
      const req = await this.lockPending(tx, id);
      const device = await registerDevice(tx, this.clock, {
        name: req.deviceName,
        platform: req.platform,
        method: 'code',
      });
      await tx
        .update(pairingRequests)
        .set({ status: 'confirmed', resolvedAt: this.clock.now(), deviceId: device.deviceId })
        .where(eq(pairingRequests.id, id));
      return {
        value: { deviceId: device.deviceId },
        entityId: device.deviceId,
        after: { name: req.deviceName, platform: req.platform, method: 'code' },
      };
    });
  }

  @Post('pairing/:id/reject')
  @HttpCode(200)
  @Contract({ errors: ['PAIRING_EXPIRED'], roles: 'public' })
  async reject(@Param('id', ParseUUIDPipe) id: string): Promise<{ rejected: true }> {
    return auditedTransaction(
      this.db,
      this.clock,
      { action: 'device.pair_rejected', entityType: 'pairing_request', entityId: id },
      async (tx) => {
        await this.lockPending(tx, id);
        await tx
          .update(pairingRequests)
          .set({ status: 'rejected', resolvedAt: this.clock.now() })
          .where(eq(pairingRequests.id, id));
        return { value: { rejected: true as const } };
      },
    );
  }

  /** QR de la pantalla del servidor: identidad, huella de la CA y un token de un solo uso (RF-RED-04). */
  @Post('qr')
  @HttpCode(201)
  @Contract({ output: qrResponseSchema, roles: 'public' })
  async qr(): Promise<z.infer<typeof qrResponseSchema>> {
    const { serverId, caFingerprint } = requireIdentity(this.info);
    const now = this.clock.now();
    const qrToken = randomToken();
    const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
    await this.db.insert(pairingQrTokens).values({ tokenHash: hashQrToken(qrToken), createdAt: now, expiresAt });
    return { qrToken, serverId, caFingerprint, expiresAt: expiresAt.toISOString() };
  }

  /** RF-RED-04: la app de escritorio de la propia PC servidor se empareja sola, sin código. */
  @Post('pair-self')
  @HttpCode(201)
  @Contract({ input: selfPairSchema, output: pairedDeviceSchema, roles: 'public' })
  async pairSelf(@Body(new ZodValidationPipe(selfPairSchema)) input: z.output<typeof selfPairSchema>) {
    return auditedTransaction(this.db, this.clock, { action: 'device.pair', entityType: 'device' }, async (tx) => {
      const device = await registerDevice(tx, this.clock, {
        name: input.deviceName,
        platform: input.platform,
        method: 'local',
      });
      return {
        value: device,
        entityId: device.deviceId,
        after: { name: input.deviceName, platform: input.platform, method: 'local' },
      };
    });
  }

  private async lockPending(tx: Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0], id: string) {
    const [req] = await tx.select().from(pairingRequests).where(eq(pairingRequests.id, id)).for('update');
    if (!req) throw new AppError('NOT_FOUND', 'La solicitud de emparejamiento no existe.');
    if (req.status !== 'pending' || req.expiresAt <= this.clock.now()) throw pairingExpired();
    return req;
  }
}
