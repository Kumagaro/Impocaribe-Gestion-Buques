import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  char,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// T027 · plan §4.2 (usuarios y seguridad), RF-USR-01, RF-AUT-02, RF-REC-01.

export const userRole = pgEnum('user_role', ['apoderada', 'operador', 'lectura']);
export const sessionKind = pgEnum('session_kind', ['app', 'device']);

export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    username: text('username').notNull().unique(),
    fullName: text('full_name').notNull(),
    nationalId: char('national_id', { length: 11 }).notNull().unique(),
    /** 8 dígitos, siempre sin el prefijo +53 (RF-USR-01). */
    phone: text('phone').notNull(),
    role: userRole('role').notNull(),
    passwordHash: text('password_hash').notNull(),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('users_username_format', sql`${t.username} ~ '^[a-z0-9._]{3,30}$'`),
    check('users_national_id_digits', sql`${t.nationalId} ~ '^[0-9]{11}$'`),
    check('users_phone_digits', sql`${t.phone} ~ '^[0-9]{8}$'`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** SHA-256 del token: el token en claro solo lo conoce el dispositivo (plan §9). */
    tokenHash: text('token_hash').notNull().unique(),
    kind: sessionKind('kind').notNull(),
    deviceId: text('device_id').notNull(),
    deviceLabel: text('device_label').notNull(),
    platform: text('platform', { enum: ['windows', 'android'] }).notNull(),
    keepSignedIn: boolean('keep_signed_in').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    check('sessions_platform', sql`${t.platform} IN ('windows', 'android')`),
    index('sessions_user_id').on(t.userId),
  ],
);

export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** Al generar un juego nuevo, el anterior se invalida (RF-REC-03). */
    batchId: uuid('batch_id').notNull(),
    codeHash: text('code_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
  },
  (t) => [index('recovery_codes_user_id').on(t.userId)],
);

/** Intentos de recuperación: 3 fallidos en una hora bloquean la recuperación de ese usuario (RF-REC-04). */
export const recoveryAttempts = pgTable(
  'recovery_attempts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').references(() => users.id),
    at: timestamp('at', { withTimezone: true }).notNull(),
    success: boolean('success').notNull(),
    deviceId: text('device_id'),
  },
  (t) => [index('recovery_attempts_user_at').on(t.userId, t.at)],
);
