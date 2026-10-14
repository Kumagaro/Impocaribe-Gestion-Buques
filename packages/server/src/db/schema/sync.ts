import { sql } from 'drizzle-orm';
import { bigint, check, date, integer, jsonb, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Estado de la sincronización (plan §4.4): una sola fila. Su bloqueo ordena los commits del registro de cambios (§5.9). */
export const syncState = pgTable(
  'sync_state',
  {
    id: smallint('id').primaryKey().default(1),
    lastSeq: bigint('last_seq', { mode: 'number' }).notNull().default(0),
    epoch: uuid('epoch')
      .notNull()
      .default(sql`uuid_generate_v7()`),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (t) => [check('sync_state_single_row', sql`${t.id} = 1`)],
);

/** Registro de cambios replicables (DT-04, plan §4.4). Solo inserción; se depura tras 30 días. */
export const changeLog = pgTable('change_log', {
  seq: bigint('seq', { mode: 'number' }).primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  op: text('op', { enum: ['upsert', 'delete'] }).notNull(),
  audience: text('audience').notNull(),
  payload: jsonb('payload').notNull(),
  refDate: date('ref_date'),
  committedAt: timestamp('committed_at', { withTimezone: true }).notNull(),
});
