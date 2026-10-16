import { sql } from 'drizzle-orm';
import { bigint, char, check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.ts';

// T035 · plan §4.2 (devices, pairing_requests), RF-RED-04 y 05, DT-24.

export const devices = pgTable(
  'devices',
  {
    /** Texto: el servidor lo genera como uuid v7, y viaja en X-Device-Id y en las sesiones (sessions.device_id). */
    id: text('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()::text`),
    name: text('name').notNull(),
    platform: text('platform', { enum: ['windows', 'android'] }).notNull(),
    appVersion: text('app_version'),
    /** Secreto HMAC del dispositivo (DT-24): el servidor lo necesita en claro para comprobar cada firma. */
    secret: text('secret').notNull(),
    pairedAt: timestamp('paired_at', { withTimezone: true }).notNull(),
    /** code o qr; local para la app de la propia PC servidor, que se empareja sola. */
    pairedMethod: text('paired_method', { enum: ['code', 'qr', 'local'] }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** Desfase medido en /sync/state (T042): hora del dispositivo − hora del servidor. */
    clockOffsetMs: bigint('clock_offset_ms', { mode: 'number' }).notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id),
  },
  (t) => [
    check('devices_platform', sql`${t.platform} IN ('windows', 'android')`),
    check('devices_paired_method', sql`${t.pairedMethod} IN ('code', 'qr', 'local')`),
  ],
);

export const pairingRequests = pgTable(
  'pairing_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    deviceName: text('device_name').notNull(),
    platform: text('platform', { enum: ['windows', 'android'] }).notNull(),
    clientNonce: text('client_nonce').notNull(),
    serverNonce: text('server_nonce').notNull(),
    code: char('code', { length: 6 }).notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'rejected', 'expired'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    deviceId: text('device_id').references(() => devices.id),
  },
  (t) => [check('pairing_requests_status', sql`${t.status} IN ('pending', 'confirmed', 'rejected', 'expired')`)],
);

/** Token de un solo uso del QR del servidor (RF-RED-04), 5 minutos. Se guarda su hash. */
export const pairingQrTokens = pgTable('pairing_qr_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  deviceId: text('device_id').references(() => devices.id),
});
