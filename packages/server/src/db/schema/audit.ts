import { bigserial, boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Bitácora de solo inserción (plan §4.2, RF-BIT-01, 02). Protegida por assert_append_only() y sin UPDATE/DELETE para la app. */
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull(),
  userId: uuid('user_id'),
  sessionId: uuid('session_id'),
  deviceId: text('device_id'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  reason: text('reason'),
  ok: boolean('ok').notNull(),
});
