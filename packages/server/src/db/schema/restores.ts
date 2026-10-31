import { sql } from 'drizzle-orm';
import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.ts';

// T107 a T109 · plan §5.10 y §10.4: cada restauración y las órdenes perdidas (emitidas después del respaldo restaurado),
// que una Apoderada recupera con su número original o descarta con motivo. Ninguna de las dos tiene FK hacia tablas que
// la restauración reemplaza: se conservan aparte y se reponen.

export const restoreStatus = pgEnum('restore_status', ['running', 'ok', 'failed']);

export const restores = pgTable('restores', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`),
  backupId: uuid('backup_id').notNull(),
  /** El respaldo del estado anterior; null si no se pudo hacer (modo de confirmación, T108). */
  preRestoreBackupId: uuid('pre_restore_backup_id'),
  status: restoreStatus('status').notNull().default('running'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  error: text('error'),
  lostOrders: integer('lost_orders').notNull().default(0),
  createdBy: uuid('created_by'),
});

export const lostOrderStatus = pgEnum('lost_order_status', ['pending', 'recovered', 'discarded']);

export const lostOrders = pgTable('lost_orders', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`),
  restoreId: uuid('restore_id').notNull(),
  /** El id que tenía la orden; al recuperarla se registra de nuevo con el mismo. */
  orderId: uuid('order_id').notNull(),
  vesselId: uuid('vessel_id').notNull(),
  number: text('number').notNull(),
  seq: integer('seq').notNull(),
  /** La orden con todas sus versiones, sus remolques y los archivos de sus PDF, tal como estaba antes de restaurar. */
  payload: jsonb('payload').notNull(),
  status: lostOrderStatus('status').notNull().default('pending'),
  /** Por qué no se pudo recuperar la última vez (p. ej. el saldo ya no alcanza). */
  lastError: text('last_error'),
  discardReason: text('discard_reason'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
