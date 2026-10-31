import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// T055 · plan §4.2 (Catálogos), RF-CAT-01 a 05 y 07: no se borran, se desactivan. Nombres, chapas y carnés se guardan
// ya normalizados (shared/domain/names.ts) y su unicidad la asegura la base.

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`);
const common = {
  active: boolean('active').notNull().default(true),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
};

export const clients = pgTable('clients', {
  id: id(),
  name: text('name').notNull(),
  /** RF-CAT-01: «Nuevos Tiempos S.R.L.» y «NUEVOS TIEMPOS SRL» son el mismo cliente. */
  nameNormalized: text('name_normalized').notNull().unique(),
  ...common,
});

export const recipients = pgTable('recipients', {
  id: id(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id),
  name: text('name').notNull(),
  address: text('address').notNull(),
  active: boolean('active').notNull().default(true),
  /** Orden en que se muestran (el de alta). */
  position: integer('position').notNull(),
});

export const carriers = pgTable('carriers', {
  id: id(),
  name: text('name').notNull(),
  nameNormalized: text('name_normalized').notNull().unique(),
  ...common,
});

export const trailers = pgTable(
  'trailers',
  {
    id: id(),
    plate: text('plate').notNull().unique(),
    capacityTons: numeric('capacity_tons', { precision: 12, scale: 3 }).notNull(),
    carrierId: uuid('carrier_id')
      .notNull()
      .references(() => carriers.id),
    ...common,
  },
  (t) => [check('trailers_capacity', sql`${t.capacityTons} > 0 AND ${t.capacityTons} <= 100`)],
);

export const trucks = pgTable('trucks', {
  id: id(),
  plate: text('plate').notNull().unique(),
  tractorPlate: text('tractor_plate'),
  carrierId: uuid('carrier_id')
    .notNull()
    .references(() => carriers.id),
  baseLocation: text('base_location').notNull().default('LA HABANA'),
  ...common,
});

/** Los remolques habituales de cada camión, en orden (RF-CAT-03): al menos uno por camión activo. */
export const truckDefaultTrailers = pgTable(
  'truck_default_trailers',
  {
    truckId: uuid('truck_id')
      .notNull()
      .references(() => trucks.id),
    trailerId: uuid('trailer_id')
      .notNull()
      .references(() => trailers.id),
    position: integer('position').notNull(),
  },
  (t) => [primaryKey({ columns: [t.truckId, t.trailerId] })],
);

export const drivers = pgTable(
  'drivers',
  {
    id: id(),
    fullName: text('full_name').notNull(),
    /** El identificador del chofer (RF-CAT-05). */
    nationalId: char('national_id', { length: 11 }).notNull().unique(),
    licenseNo: char('license_no', { length: 11 }).notNull().unique(),
    carrierId: uuid('carrier_id')
      .notNull()
      .references(() => carriers.id),
    ...common,
  },
  (t) => [
    check('drivers_national_id_digits', sql`${t.nationalId} ~ '^[0-9]{11}$'`),
    check('drivers_license_digits', sql`${t.licenseNo} ~ '^[0-9]{11}$'`),
  ],
);
