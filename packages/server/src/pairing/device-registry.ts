// DT-24: los dispositivos emparejados, leídos de la tabla devices para la guarda de cada petición.
import type { Clock } from '@impocaribe/shared';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { devices } from '../db/schema/devices.ts';
import type { DeviceRecord, DeviceRegistry } from '../http/device.guard.ts';

/** last_seen_at como mucho una vez por minuto: no hace falta escribir en cada petición. */
const SEEN_EVERY_MS = 60_000;

export class DbDeviceRegistry implements DeviceRegistry {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly clock: Clock,
  ) {}

  async find(deviceId: string): Promise<DeviceRecord | null> {
    const [row] = await this.db
      .select({ secret: devices.secret, revokedAt: devices.revokedAt, clockOffsetMs: devices.clockOffsetMs })
      .from(devices)
      .where(eq(devices.id, deviceId));
    if (!row) return null;
    return { secret: row.secret, revoked: row.revokedAt !== null, clockOffsetMs: row.clockOffsetMs };
  }

  async seen(deviceId: string): Promise<void> {
    const now = this.clock.now();
    await this.db
      .update(devices)
      .set({ lastSeenAt: now })
      .where(
        and(
          eq(devices.id, deviceId),
          or(isNull(devices.lastSeenAt), lt(devices.lastSeenAt, new Date(now.getTime() - SEEN_EVERY_MS))),
        ),
      );
  }
}
