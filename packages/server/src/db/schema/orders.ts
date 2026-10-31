import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { drivers, recipients, trailers, trucks } from './catalogs.ts';
import { files, officialSignatures, officialStamps } from './company.ts';
import { users } from './users.ts';
import { allocations, customsDeclarations, customsDeclarationVersions, vessels } from './vessels.ts';

// T075 y T076 · plan §4.2 (Órdenes y Borradores). Las versiones de una orden son de solo inserción: lo único que
// cambia es su estado, de `official` a `replaced`, y solo por el trigger controlado de la migración 0010.

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`);
const tons = (name: string) => numeric(name, { precision: 12, scale: 3, mode: 'string' });
const at = (name: string) => timestamp(name, { withTimezone: true });

export const orderStatus = pgEnum('order_status', ['official', 'voided']);
export const orderVersionStatus = pgEnum('order_version_status', ['official', 'replaced', 'voided']);

export const loadOrders = pgTable(
  'load_orders',
  {
    id: id(),
    vesselId: uuid('vessel_id')
      .notNull()
      .references(() => vessels.id),
    /** Const. art. VI: correlativo por buque (viaje), sin huecos. */
    seq: integer('seq').notNull(),
    number: text('number').notNull().unique(),
    declarationId: uuid('declaration_id')
      .notNull()
      .references(() => customsDeclarations.id),
    allocationId: uuid('allocation_id')
      .notNull()
      .references(() => allocations.id),
    currentVersionId: uuid('current_version_id'),
    status: orderStatus('status').notNull(),
    createdAt: at('created_at').notNull(),
  },
  (t) => [unique('load_orders_vessel_seq').on(t.vesselId, t.seq)],
);

export const loadOrderVersions = pgTable(
  'load_order_versions',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => loadOrders.id),
    versionNo: integer('version_no').notNull(),
    status: orderVersionStatus('status').notNull(),
    /** RF-DM-04: la versión de la DM vigente al emitir. */
    declarationVersionId: uuid('declaration_version_id')
      .notNull()
      .references(() => customsDeclarationVersions.id),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => recipients.id),
    truckId: uuid('truck_id')
      .notNull()
      .references(() => trucks.id),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => drivers.id),
    tons: tons('tons').notNull(),
    waybillNo: text('waybill_no').notNull(),
    lotNo: text('lot_no'),
    routeSheetNo: text('route_sheet_no'),
    container: text('container'),
    loadingDate: date('loading_date', { mode: 'string' }).notNull(),
    issuedAt: at('issued_at').notNull(),
    issuedBy: uuid('issued_by').references(() => users.id),
    issuedDevice: text('issued_device'),
    reason: text('reason'),
    capacityOverrideReason: text('capacity_override_reason'),
    sameDayOverrideReason: text('same_day_override_reason'),
    signatureId: uuid('signature_id')
      .notNull()
      .references(() => officialSignatures.id),
    stampId: uuid('stamp_id')
      .notNull()
      .references(() => officialStamps.id),
    /** Todos los datos impresos, congelados (Const. art. III). */
    snapshot: jsonb('snapshot').notNull(),
    pdfFileId: uuid('pdf_file_id')
      .notNull()
      .references(() => files.id),
    pdfSha256: text('pdf_sha256').notNull(),
  },
  (t) => [
    unique('load_order_versions_no').on(t.orderId, t.versionNo),
    check('load_order_versions_tons_positive', sql`${t.tons} > 0`),
    check('load_order_versions_reason', sql`${t.versionNo} = 1 OR ${t.reason} IS NOT NULL`),
    // D5: solo para detectar el camión repetido; la repetición se permite con decisión.
    index('load_order_versions_truck_day')
      .on(t.truckId, t.loadingDate)
      .where(sql`${t.status} = 'official'`),
  ],
);

export const loadOrderVersionTrailers = pgTable(
  'load_order_version_trailers',
  {
    versionId: uuid('version_id')
      .notNull()
      .references(() => loadOrderVersions.id),
    trailerId: uuid('trailer_id')
      .notNull()
      .references(() => trailers.id),
    position: integer('position').notNull(),
    capacityTonsSnapshot: tons('capacity_tons_snapshot').notNull(),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.trailerId] })],
);

export const draftVisibility = pgEnum('draft_visibility', ['private', 'shared']);

export const drafts = pgTable('drafts', {
  id: id(),
  /** Lo genera el dispositivo: la subida es idempotente. */
  clientDraftId: uuid('client_draft_id').notNull().unique(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  visibility: draftVisibility('visibility').notNull(),
  payload: jsonb('payload').notNull(),
  lockedBy: uuid('locked_by').references(() => users.id),
  lockExpiresAt: at('lock_expires_at'),
  sharedAt: at('shared_at'),
  updatedAt: at('updated_at').notNull(),
  discardedAt: at('discarded_at'),
  issuedOrderId: uuid('issued_order_id').references(() => loadOrders.id),
});
