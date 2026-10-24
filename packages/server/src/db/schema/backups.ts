import { sql } from 'drizzle-orm';
import { bigint, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.ts';

// T106 · plan §4.2 y §10.4: cada respaldo (el archivo .icbak va en la carpeta de datos) y su copia a la carpeta externa.

export const backupKind = pgEnum('backup_kind', ['hourly', 'daily', 'manual', 'pre_restore']);
export const backupStatus = pgEnum('backup_status', ['running', 'ok', 'failed']);

export const backups = pgTable('backups', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`),
  kind: backupKind('kind').notNull(),
  status: backupStatus('status').notNull().default('running'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  /** Relativo a la carpeta de datos: backups/2026-10-23T14-00-00Z-hourly.icbak. */
  filePath: text('file_path'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  sha256: text('sha256'),
  error: text('error'),
  /** Solo los diarios: la copia en la carpeta externa (la USB) y cuándo se hizo. */
  externalPath: text('external_path'),
  externalCopiedAt: timestamp('external_copied_at', { withTimezone: true }),
  /** El manual: quién lo pidió. */
  createdBy: uuid('created_by').references(() => users.id),
});
