import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './users.ts';

// T050 a T052 · plan §4.2 (Empresa): archivos, firma y cuño oficiales, y la configuración del sistema en una sola fila.

/** T050: el binario va en disco (carpeta de datos); aquí, su huella y dónde está. Solo inserción. */
export const files = pgTable('files', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`),
  sha256: char('sha256', { length: 64 }).notNull(),
  mime: text('mime').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  /** Relativa a la carpeta de datos: la carpeta puede cambiar de unidad en un traslado. */
  storagePath: text('storage_path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

/** RF-EMP-02 y 05: cada reemplazo es una fila nueva; los PDF ya emitidos apuntan a la suya. Solo inserción. */
export const officialSignatures = pgTable('official_signatures', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id),
  representativeName: text('representative_name').notNull(),
  credentialNo: text('credential_no').notNull(),
  position: text('position').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const officialStamps = pgTable('official_stamps', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const networkSetup = pgEnum('network_setup', ['router', 'hotspot']);

/**
 * Una sola fila (id = 1), creada por la migración. Los valores por defecto son los de RF-CFG-02; el montaje y el código
 * de instalación los guardará el ayudante de instalación (T126).
 */
export const systemSettings = pgTable(
  'system_settings',
  {
    id: smallint('id').primaryKey().default(1),
    legalName: text('legal_name'),
    address: text('address'),
    maxLoadingDaysAhead: integer('max_loading_days_ahead').notNull().default(7),
    workdayStart: time('workday_start').notNull().default('07:00'),
    workdayEnd: time('workday_end').notNull().default('19:00'),
    dailyBackupHour: time('daily_backup_hour').notNull().default('20:00'),
    externalBackupDir: text('external_backup_dir'),
    networkSetup: networkSetup('network_setup').notNull().default('router'),
    /** argon2id; null hasta que lo guarde el instalador (o db:reset en desarrollo, con IMPOCARIBE_INSTALL_CODE). */
    installationCodeHash: text('installation_code_hash'),
    /** null: el texto por defecto de RF-DM-13 (DEFAULT_LEGAL_NOTICE). */
    deadlineLegalNotice: text('deadline_legal_notice'),
    currentSignatureId: uuid('current_signature_id').references((): AnyPgColumn => officialSignatures.id),
    currentStampId: uuid('current_stamp_id').references((): AnyPgColumn => officialStamps.id),
    rowVersion: integer('row_version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [
    check('system_settings_single_row', sql`${t.id} = 1`),
    check('system_settings_loading_days', sql`${t.maxLoadingDaysAhead} BETWEEN 0 AND 30`),
    check('system_settings_workday', sql`${t.workdayStart} < ${t.workdayEnd}`),
  ],
);
