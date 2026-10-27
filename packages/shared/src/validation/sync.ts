// T042 · plan §4.4, §5.9 y §6.2 (Sincronización): lo que el servidor publica y la copia local guarda. El servidor es
// el único que escribe (Const. art. VII): la app solo aplica, en orden, los cambios que recibe.
import { z } from 'zod';

/** Entidades replicadas hasta hoy (plan §4.4). Cada fase añade las suyas: buques, DM, órdenes, catálogos… */
export const SYNC_ENTITIES = [
  'user_directory',
  'user_admin',
  'client',
  'carrier',
  'truck',
  'trailer',
  'driver',
  'vessel',
  'declaration',
  'order',
  'draft',
  'alert',
] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const syncStateSchema = z.object({
  epoch: z.uuid(),
  lastSeq: z.number().int().nonnegative(),
  schemaVersion: z.number().int().positive(),
  /** Hora del servidor: los plazos y fechas que deciden la usan siempre (RF-CON-10). */
  serverTime: z.iso.datetime(),
});

const record = {
  entityType: z.enum(SYNC_ENTITIES),
  entityId: z.uuid(),
};

export const syncChangeSchema = z.object({
  seq: z.number().int().positive(),
  ...record,
  op: z.enum(['upsert', 'delete']),
  payload: z.unknown(),
  refDate: z.iso.date().nullable(),
});
export type SyncChange = z.infer<typeof syncChangeSchema>;

export const syncChangesQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export const syncChangesResponseSchema = z.object({
  changes: z.array(syncChangeSchema),
  /** Hasta dónde se revisó el registro: la próxima consulta sigue desde aquí (los cambios de otras audiencias no se ven). */
  nextSince: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const syncSnapshotQuerySchema = z.object({ cursor: z.string().max(200).optional() });

export const syncSnapshotResponseSchema = z.object({
  epoch: z.uuid(),
  /** Número de cambio en el que se tomó la página: tras la instantánea, la app pide los cambios desde el de la primera. */
  seq: z.number().int().nonnegative(),
  records: z.array(z.object({ ...record, payload: z.unknown(), refDate: z.iso.date().nullable() })),
  nextCursor: z.string().nullable(),
});

/** Directorio de usuarios, para todos (plan §4.4): solo lo que hace falta para mostrar nombres y roles. */
export const userDirectoryEntrySchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  role: z.enum(['apoderada', 'operador', 'lectura']),
  active: z.boolean(),
});
export type UserDirectoryEntry = z.infer<typeof userDirectoryEntrySchema>;

/** Mensajes del WebSocket (plan §6.4). */
export const wsServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('sync.available'), seq: z.number().int().nonnegative() }),
  z.object({ type: z.literal('session.revoked') }),
  z.object({ type: z.literal('device.revoked') }),
  z.object({ type: z.literal('sync.epoch_changed') }),
  /** RF-ALR-01: aviso inmediato; el detalle llega también por sincronización. */
  z.object({ type: z.literal('alert.created'), id: z.uuid(), alertType: z.string(), title: z.string() }),
  /** T113 · AL-15: se publicó una versión de la app; `mandatory` si además es la mínima compatible. */
  z.object({
    type: z.literal('app.update'),
    platform: z.enum(['windows', 'android']),
    version: z.string(),
    mandatory: z.boolean(),
  }),
  /** T132 · RF-ENE-02, 03: el servidor con batería o en modo protegido; con corriente de nuevo, onBattery false. */
  z.object({
    type: z.literal('server.power'),
    onBattery: z.boolean(),
    percent: z.number().nullable(),
    protected: z.boolean(),
  }),
]);
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;
