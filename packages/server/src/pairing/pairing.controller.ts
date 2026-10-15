// T035 · RF-RED-04: emparejamiento de un dispositivo nuevo, por código de comparación o por el QR del servidor. Estas
// rutas son públicas (DT-24): el dispositivo aún no tiene secreto. El código se deriva de la huella de la CA y de dos
// nonces (plan §9), así que un intermediario no puede hacer coincidir los dos extremos.
import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AppError, pairingCode, type Clock } from '@impocaribe/shared';
import {
  pairedDeviceSchema,
  pairingRequestResponseSchema,
  pairingRequestSchema,
  pairingStatusSchema,
  qrPairSchema,
} from '@impocaribe/shared/validation';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createHash, randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { auditedTransaction, type Tx } from '../audit/audit-log.ts';
import { devices, pairingQrTokens, pairingRequests } from '../db/schema/devices.ts';
import type { ServerInfo } from '../discovery/discovery.controller.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DB, SERVER_INFO } from '../tokens.ts';

/** RF-RED-04: una solicitud no confirmada caduca a los 5 minutos; el QR, también. */
export const PAIRING_TTL_MS = 5 * 60_000;
export const randomToken = () => randomBytes(32).toString('base64url');
export const hashQrToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const pairingExpired = () =>
  new AppError('PAIRING_EXPIRED', 'La solicitud de emparejamiento caducó. Vuelva a empezar desde el dispositivo.');

export function requireIdentity(info: ServerInfo | null): ServerInfo {
  if (!info)
    throw new AppError('NOT_FOUND', 'Este servidor aún no tiene identidad: créela con el ayudante de instalación.');
  return info;
}

/** Da de alta el dispositivo con su secreto propio (DT-24). */
export async function registerDevice(
  tx: Tx,
  clock: Clock,
  input: { name: string; platform: 'windows' | 'android'; method: 'code' | 'qr' | 'local' },
): Promise<{ deviceId: string; deviceSecret: string }> {
  const deviceSecret = randomToken();
  const [row] = await tx
    .insert(devices)
    .values({
      name: input.name,
      platform: input.platform,
      secret: deviceSecret,
      pairedAt: clock.now(),
      pairedMethod: input.method,
    })
    .returning({ id: devices.id });
  return { deviceId: row!.id, deviceSecret };
}

@Controller('pairing')
export class PairingController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SERVER_INFO) private readonly info: ServerInfo | null,
  ) {}

  @Post('requests')
  @HttpCode(201)
  @Contract({ input: pairingRequestSchema, output: pairingRequestResponseSchema, roles: 'public' })
  async request(
    @Body(new ZodValidationPipe(pairingRequestSchema)) input: z.output<typeof pairingRequestSchema>,
  ): Promise<z.infer<typeof pairingRequestResponseSchema>> {
    const { caFingerprint } = requireIdentity(this.info);
    const now = this.clock.now();
    const serverNonce = randomToken();
    const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
    const [row] = await this.db
      .insert(pairingRequests)
      .values({
        deviceName: input.deviceName,
        platform: input.platform,
        clientNonce: input.clientNonce,
        serverNonce,
        code: await pairingCode(caFingerprint, input.clientNonce, serverNonce),
        status: 'pending',
        createdAt: now,
        expiresAt,
      })
      .returning({ id: pairingRequests.id });
    return { requestId: row!.id, serverNonce, expiresAt: expiresAt.toISOString() };
  }

  /** La app consulta su solicitud con su nonce; al confirmarse recibe su identificador y su secreto. */
  @Get('requests/:id')
  @Contract({ output: pairingStatusSchema, errors: ['PAIRING_REJECTED', 'PAIRING_EXPIRED'], roles: 'public' })
  async status(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('clientNonce') clientNonce: string,
  ): Promise<z.infer<typeof pairingStatusSchema>> {
    const [req] = await this.db
      .select({
        status: pairingRequests.status,
        expiresAt: pairingRequests.expiresAt,
        secret: devices.secret,
        deviceId: devices.id,
      })
      .from(pairingRequests)
      .leftJoin(devices, eq(devices.id, pairingRequests.deviceId))
      .where(and(eq(pairingRequests.id, id), eq(pairingRequests.clientNonce, clientNonce ?? '')));
    if (!req) throw new AppError('NOT_FOUND', 'La solicitud de emparejamiento no existe.');
    if (req.status === 'confirmed') return { status: 'confirmed', deviceId: req.deviceId!, deviceSecret: req.secret! };
    if (req.status === 'rejected')
      throw new AppError('PAIRING_REJECTED', 'El emparejamiento se rechazó en la pantalla del servidor.');
    if (req.status === 'expired' || req.expiresAt <= this.clock.now()) throw pairingExpired();
    return { status: 'pending' };
  }

  /** Emparejamiento directo con el QR de la pantalla del servidor: un solo uso, 5 minutos. */
  @Post('qr')
  @HttpCode(201)
  @Contract({ input: qrPairSchema, output: pairedDeviceSchema, errors: ['PAIRING_EXPIRED'], roles: 'public' })
  async qr(@Body(new ZodValidationPipe(qrPairSchema)) input: z.output<typeof qrPairSchema>) {
    return auditedTransaction(this.db, this.clock, { action: 'device.pair', entityType: 'device' }, async (tx) => {
      const now = this.clock.now();
      const [token] = await tx
        .update(pairingQrTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(pairingQrTokens.tokenHash, hashQrToken(input.qrToken)),
            isNull(pairingQrTokens.usedAt),
            gt(pairingQrTokens.expiresAt, now),
          ),
        )
        .returning({ tokenHash: pairingQrTokens.tokenHash });
      if (!token)
        throw new AppError(
          'PAIRING_EXPIRED',
          'Este código QR ya se usó o caducó. Genere uno nuevo en la pantalla del servidor.',
        );
      const device = await registerDevice(tx, this.clock, {
        name: input.deviceName,
        platform: input.platform,
        method: 'qr',
      });
      await tx
        .update(pairingQrTokens)
        .set({ deviceId: device.deviceId })
        .where(eq(pairingQrTokens.tokenHash, token.tokenHash));
      return {
        value: device,
        entityId: device.deviceId,
        after: { name: input.deviceName, platform: input.platform, method: 'qr' },
      };
    });
  }
}
