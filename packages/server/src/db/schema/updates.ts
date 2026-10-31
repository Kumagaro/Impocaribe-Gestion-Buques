import { sql } from 'drizzle-orm';
import { boolean, char, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { files } from './company.ts';
import { users } from './users.ts';

// T113 · plan §4.2 (app_releases), RF-UPD-01: las versiones publicadas del instalador ligero y del APK, y los
// instaladores del WebView para P-27. Cada plataforma tiene a lo sumo una versión mínima compatible vigente.

export const releasePlatform = pgEnum('release_platform', [
  'windows',
  'android',
  'android-webview-chrome',
  'android-webview-system',
]);

export const appReleases = pgTable(
  'app_releases',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    platform: releasePlatform('platform').notNull(),
    version: text('version').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    sha256: char('sha256', { length: 64 }).notNull(),
    notes: text('notes').notNull().default(''),
    isMinSupported: boolean('is_min_supported').notNull().default(false),
    /** T117: la firma Ed25519 del instalador de Windows (base64); null en las demás plataformas. */
    signature: text('signature'),
    publishedBy: uuid('published_by').references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('app_releases_platform_version').on(t.platform, t.version),
    uniqueIndex('app_releases_one_min')
      .on(t.platform)
      .where(sql`${t.isMinSupported}`),
  ],
);
