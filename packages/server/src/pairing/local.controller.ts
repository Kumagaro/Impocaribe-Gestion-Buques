// T035 · plan §6.2 (Administración local) y §9: lo que solo se hace ante la PC servidor. Quien está ahí confirma o
// rechaza los emparejamientos (RF-RED-04, sin sesión) y genera el QR; la app de la propia PC servidor se empareja sola.
import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AppError, type Clock } from '@impocaribe/shared';
import {
  pairedDeviceSchema,
  pendingPairingsSchema,
  qrResponseSchema,
  selfPairSchema,
  localApoderadasSchema,
  SERVER_MEMORY_BUDGET_BYTES,
  serverStatusSchema,
} from '@impocaribe/shared/validation';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { networkInterfaces } from 'node:os';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';
import { auditedTransaction } from '../audit/audit-log.ts';
import { systemSettings } from '../db/schema/company.ts';
import { devices, pairingQrTokens, pairingRequests } from '../db/schema/devices.ts';
import { users } from '../db/schema/users.ts';
import type { ServerInfo } from '../discovery/discovery.controller.ts';
import { Contract } from '../http/contract.ts';
import { localOnlyGuard } from '../http/local-only.guard.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { config } from '../config.ts';
import { PdfService } from '../orders/pdf-engine.ts';
import { Power } from '../power/power.ts';
import { lanInterface } from '../setup/facts.ts';
import { Realtime } from '../sync/realtime.ts';
import { CLOCK, DB, MEMORY_PROBE, SERVER_INFO } from '../tokens.ts';
import type { MemoryProbe } from './memory.ts';
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
  /** Cuándo arrancó el servidor (P-29: «encendido hace…»). */
  private readonly startedAt: Date;

  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SERVER_INFO) private readonly info: ServerInfo | null,
    @Inject(MEMORY_PROBE) private readonly memory: MemoryProbe,
    private readonly realtime: Realtime,
    private readonly power: Power,
    private readonly pdf: PdfService,
  ) {
    this.startedAt = clock.now();
  }

  /**
   * T128 · P-29 y plan §6.2: servicio, versión, energía, montaje, dirección, dispositivos (con los conectados ahora) y
   * memoria contra el presupuesto del plan §10.7 (RNF-21).
   */
  @Get('status')
  @Contract({ output: serverStatusSchema, roles: 'public' })
  async status(): Promise<z.infer<typeof serverStatusSchema>> {
    const { serverId, version } = requireIdentity(this.info);
    const [settings] = await this.db.select({ setup: systemSettings.networkSetup }).from(systemSettings);
    const rows = await this.db.select().from(devices).where(isNull(devices.revokedAt)).orderBy(asc(devices.pairedAt));
    const connected = this.realtime.connectedDeviceIds();
    const measured = await this.memory(this.pdf.open);
    return {
      serverId,
      version,
      startedAt: this.startedAt.toISOString(),
      power: this.power.snapshot(),
      network: {
        setup: settings?.setup ?? null,
        address: lanInterface(networkInterfaces())?.address ?? null,
        port: config().port,
      },
      devices: rows.map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        pairedAt: d.pairedAt.toISOString(),
        pairedMethod: d.pairedMethod,
        lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
        connected: connected.has(d.id),
      })),
      memory: { budgetBytes: SERVER_MEMORY_BUDGET_BYTES, serviceBytes: process.memoryUsage().rss, ...measured },
    };
  }

  /** T128 · RF-INS-11: las Apoderadas activas, para elegir a quién se restablece la contraseña (P-29). */
  @Get('apoderadas')
  @Contract({ output: localApoderadasSchema, roles: 'public' })
  async apoderadas(): Promise<z.infer<typeof localApoderadasSchema>> {
    return this.db
      .select({ username: users.username, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.role, 'apoderada'), eq(users.active, true)))
      .orderBy(asc(users.fullName));
  }

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
