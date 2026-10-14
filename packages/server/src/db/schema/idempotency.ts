import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Claves de idempotencia (DT-22, plan §4.2): el resultado de cada escritura, guardado 24 h en su misma transacción. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    deviceId: text('device_id').notNull(),
    key: uuid('key').notNull(),
    userId: uuid('user_id'),
    method: text('method').notNull(),
    path: text('path').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code'),
    response: jsonb('response'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.key] })],
);
