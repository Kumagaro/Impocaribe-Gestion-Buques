import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './catalogs.ts';
import { users } from './users.ts';

// T062 a T068 · plan §4.2 (Buques, DM y asignaciones). Los saldos no se guardan: los calculan las vistas de §4.3
// (Const. art. I). Las versiones de DM, los cambios de asignación y los destinos del sobrante son de solo inserción.

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`);
const tons = (name: string) => numeric(name, { precision: 12, scale: 3, mode: 'string' });
const at = (name: string) => timestamp(name, { withTimezone: true });
const by = (name: string) => uuid(name).references(() => users.id);

export const vesselStatus = pgEnum('vessel_status', ['open', 'closed']);

export const vessels = pgTable(
  'vessels',
  {
    id: id(),
    name: text('name').notNull(),
    /** RF-BUQ-02: derivado del nombre al guardar. */
    code: text('code').notNull(),
    manifest: text('manifest').notNull(),
    bl: text('bl').notNull(),
    port: text('port').notNull(),
    internalBuyer: text('internal_buyer').notNull(),
    etaDate: date('eta_date', { mode: 'string' }),
    /** RF-BUQ-03, 07: NULL hasta el arribo; fija el año y el viaje de la numeración. */
    arrivalDate: date('arrival_date', { mode: 'string' }),
    voyageNo: integer('voyage_no'),
    totalTons: tons('total_tons').notNull(),
    /** Contador de numeración (plan §5.2); lo usan las órdenes (F6). */
    lastOrderSeq: integer('last_order_seq').notNull().default(0),
    status: vesselStatus('status').notNull().default('open'),
    closedAt: at('closed_at'),
    closedBy: by('closed_by'),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: at('created_at').notNull(),
    updatedAt: at('updated_at').notNull(),
  },
  (t) => [
    check('vessels_total_positive', sql`${t.totalTons} > 0`),
    check('vessels_arrival_voyage', sql`(${t.arrivalDate} IS NULL) = (${t.voyageNo} IS NULL)`),
  ],
);

export const declarationVersionKind = pgEnum('declaration_version_kind', ['create', 'edit', 'reactivate', 'expire']);

export const customsDeclarations = pgTable(
  'customs_declarations',
  {
    id: id(),
    /** RF-DM-01, 02: 5 dígitos, único para siempre. */
    number: char('number', { length: 5 }).notNull().unique(),
    /** D13: inmutable (trigger). */
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    /** D13: fecha de creación en La Habana, inmutable (trigger). */
    declarationDate: date('declaration_date', { mode: 'string' }).notNull(),
    currentVersionId: uuid('current_version_id'),
    /** RF-PLZ-01: día 1 del plazo vigente. */
    deadlineStartDate: date('deadline_start_date', { mode: 'string' }).notNull(),
    expiredAt: at('expired_at'),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: at('created_at').notNull(),
  },
  (t) => [check('customs_declarations_number_digits', sql`${t.number} ~ '^[0-9]{5}$'`)],
);

export const customsDeclarationVersions = pgTable(
  'customs_declaration_versions',
  {
    id: id(),
    declarationId: uuid('declaration_id')
      .notNull()
      .references(() => customsDeclarations.id),
    versionNo: integer('version_no').notNull(),
    brand: text('brand').notNull(),
    /** NULL: pendiente de total. */
    totalTons: tons('total_tons'),
    kind: declarationVersionKind('kind').notNull(),
    reason: text('reason'),
    createdBy: by('created_by'),
    createdAt: at('created_at').notNull(),
  },
  (t) => [
    unique('customs_declaration_versions_no').on(t.declarationId, t.versionNo),
    check('customs_declaration_versions_total_positive', sql`${t.totalTons} IS NULL OR ${t.totalTons} > 0`),
    check('customs_declaration_versions_reason', sql`${t.kind} = 'create' OR ${t.reason} IS NOT NULL`),
  ],
);

export const allocations = pgTable(
  'allocations',
  {
    id: id(),
    declarationId: uuid('declaration_id')
      .notNull()
      .references(() => customsDeclarations.id),
    vesselId: uuid('vessel_id')
      .notNull()
      .references(() => vessels.id),
    allocatedTons: tons('allocated_tons').notNull(),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: at('created_at').notNull(),
    updatedAt: at('updated_at').notNull(),
  },
  (t) => [
    unique('allocations_declaration_vessel').on(t.declarationId, t.vesselId),
    check('allocations_tons_nonnegative', sql`${t.allocatedTons} >= 0`),
  ],
);

export const allocationChangeKind = pgEnum('allocation_change_kind', [
  'assign',
  'partial_assign',
  'edit',
  'expire_release',
  'void_release',
  'surplus_assign',
]);

export const allocationChanges = pgTable('allocation_changes', {
  id: id(),
  allocationId: uuid('allocation_id')
    .notNull()
    .references(() => allocations.id),
  previousTons: tons('previous_tons').notNull(),
  newTons: tons('new_tons').notNull(),
  kind: allocationChangeKind('kind').notNull(),
  reason: text('reason'),
  createdBy: by('created_by'),
  createdAt: at('created_at').notNull(),
});

export const surplusKind = pgEnum('surplus_kind', ['allocate', 'transfer', 'loss']);

/** RF-BUQ-08, 09: destinos del sobrante. */
export const vesselSurplusDispositions = pgTable(
  'vessel_surplus_dispositions',
  {
    id: id(),
    vesselId: uuid('vessel_id')
      .notNull()
      .references(() => vessels.id),
    tons: tons('tons').notNull(),
    kind: surplusKind('kind').notNull(),
    targetVesselId: uuid('target_vessel_id').references(() => vessels.id),
    targetAllocationId: uuid('target_allocation_id').references(() => allocations.id),
    reason: text('reason').notNull(),
    createdBy: by('created_by'),
    createdAt: at('created_at').notNull(),
  },
  (t) => [
    check('vessel_surplus_dispositions_tons_positive', sql`${t.tons} > 0`),
    check(
      'vessel_surplus_dispositions_target',
      sql`(${t.kind} = 'transfer') = (${t.targetVesselId} IS NOT NULL) AND (${t.kind} = 'allocate') = (${t.targetAllocationId} IS NOT NULL)`,
    ),
    check('vessel_surplus_dispositions_other_vessel', sql`${t.targetVesselId} IS DISTINCT FROM ${t.vesselId}`),
  ],
);

// Plan §4.3: las vistas de saldo (creadas en la migración 0009); aquí solo se describen para leerlas con tipos.
export const vAllocationBalance = pgView('v_allocation_balance', {
  allocationId: uuid('allocation_id').notNull(),
  declarationId: uuid('declaration_id').notNull(),
  vesselId: uuid('vessel_id').notNull(),
  allocatedTons: tons('allocated_tons').notNull(),
  loadedTons: tons('loaded_tons').notNull(),
  balanceTons: tons('balance_tons').notNull(),
}).existing();

export const vDeclarationBalance = pgView('v_declaration_balance', {
  declarationId: uuid('declaration_id').notNull(),
  totalTons: tons('total_tons'),
  allocatedTons: tons('allocated_tons').notNull(),
  loadedTons: tons('loaded_tons').notNull(),
  balanceTons: tons('balance_tons'),
  pendingAllocationTons: tons('pending_allocation_tons'),
}).existing();

export const vVesselBalance = pgView('v_vessel_balance', {
  vesselId: uuid('vessel_id').notNull(),
  totalTons: tons('total_tons').notNull(),
  allocatedTons: tons('allocated_tons').notNull(),
  loadedTons: tons('loaded_tons').notNull(),
  freeTons: tons('free_tons').notNull(),
  remainingTons: tons('remaining_tons').notNull(),
  disposedOutTons: tons('disposed_out_tons').notNull(),
  surplusTons: tons('surplus_tons').notNull(),
  unresolvedSurplusTons: tons('unresolved_surplus_tons').notNull(),
}).existing();
