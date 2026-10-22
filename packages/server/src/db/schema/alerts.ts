import { sql } from 'drizzle-orm';
import { jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.ts';

// T092 · plan §4.2 (Alertas). Una alerta de condición tiene clave (`dedupe_key`): mientras está abierta no se repite.
// Al insertarse avisa por NOTIFY (migración 0011), que sale solo al confirmar la transacción.

export const alertKind = pgEnum('alert_kind', ['condition', 'event']);
export const alertStatus = pgEnum('alert_status', ['open', 'resolved', 'attended']);

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    type: text('type').notNull(),
    kind: alertKind('kind').notNull(),
    dedupeKey: text('dedupe_key'),
    /** Roles que la ven (RF-ALR-05). */
    audienceRoles: text('audience_roles').array().notNull(),
    /** AL-08: el autor del borrador, además de los roles. */
    targetUserId: uuid('target_user_id').references(() => users.id),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    payload: jsonb('payload'),
    status: alertStatus('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    attendedBy: uuid('attended_by').references(() => users.id),
    attendedAt: timestamp('attended_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('alerts_open_dedupe')
      .on(t.dedupeKey)
      .where(sql`${t.status} = 'open'`),
  ],
);
