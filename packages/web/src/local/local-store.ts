// T044 · DT-03 y plan §7.1: la copia local. Una tabla por entidad replicada (el DTO que calculó el servidor, tal cual)
// y sync_meta. La única que escribe es la sincronización (T045); las pantallas solo leen (Const. art. VII.2).
import { SYNC_ENTITIES, type SyncChange, type SyncEntity } from '@impocaribe/shared/validation';
import type { LocalDatabase, Platform, SqlExecutor } from '../platform/platform';

const entityTable = (name: string) =>
  `CREATE TABLE "${name}" (id TEXT PRIMARY KEY, payload TEXT NOT NULL, ref_date TEXT, seq INTEGER NOT NULL)`;

/** Migraciones propias de la copia local, en orden; PRAGMA user_version guarda cuántas se aplicaron. */
const MIGRATIONS: string[][] = [
  [
    'CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    entityTable('user_directory'),
    entityTable('user_admin'),
  ],
  // T056: catálogos (plan §4.4).
  ['client', 'carrier', 'truck', 'trailer', 'driver'].map(entityTable),
  // T066: buques y DM con sus saldos.
  ['vessel', 'declaration'].map(entityTable),
  // T079 y T087: órdenes y borradores del servidor; y los borradores que solo viven en este dispositivo (RF-ORD-06),
  // que la sincronización no toca.
  [
    ...['order', 'draft'].map(entityTable),
    'CREATE TABLE local_drafts (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)',
  ],
];
export const LOCAL_SCHEMA_VERSION = MIGRATIONS.length;

export interface SyncMeta {
  /** Último número de cambio aplicado. */
  seq: number | null;
  epoch: string | null;
  schemaVersion: number | null;
  /** Hora del servidor de la última sincronización completa: "datos al {fecha y hora}" (RF-CON-05). */
  syncedAt: string | null;
  /** Hora del dispositivo − hora del servidor en la última sincronización: estima la hora del servidor sin conexión. */
  skewMs: number | null;
}

type Change = Omit<SyncChange, 'seq'> & { seq: number };

/** El nombre de la tabla, solo de la lista conocida: nunca se arma SQL con lo que llega de la red. */
function tableOf(entity: string): string {
  if (!(SYNC_ENTITIES as readonly string[]).includes(entity)) throw new Error(`Entidad desconocida: ${entity}`);
  // Entre comillas: `order` es palabra reservada de SQL.
  return `"${entity}"`;
}

async function applyIn(tx: SqlExecutor, changes: Change[], seq: number): Promise<void> {
  for (const c of changes) {
    const table = tableOf(c.entityType);
    if (c.op === 'delete') await tx.execute(`DELETE FROM ${table} WHERE id = ?`, [c.entityId]);
    else
      await tx.execute(
        `INSERT INTO ${table} (id, payload, ref_date, seq) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, ref_date = excluded.ref_date, seq = excluded.seq`,
        [c.entityId, JSON.stringify(c.payload), c.refDate, c.seq],
      );
  }
  await tx.execute("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('seq', ?)", [String(seq)]);
}

async function clearIn(tx: SqlExecutor): Promise<void> {
  await tx.execute('DELETE FROM sync_meta');
  for (const entity of SYNC_ENTITIES) await tx.execute(`DELETE FROM ${tableOf(entity)}`);
}

export class LocalStore {
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(readonly db: LocalDatabase) {}

  static async open(platform: Platform): Promise<LocalStore> {
    const db = await platform.openDatabase('impocaribe');
    await LocalStore.migrate(db);
    return new LocalStore(db);
  }

  static async migrate(db: LocalDatabase): Promise<void> {
    const [row] = await db.query<{ user_version: number }>('PRAGMA user_version');
    const from = row?.user_version ?? 0;
    for (let v = from; v < MIGRATIONS.length; v++) {
      await db.transaction(async (tx) => {
        for (const statement of MIGRATIONS[v]!) await tx.execute(statement);
        // RF-CON-09: si una actualización de la app cambia la estructura, la copia se reconstruye.
        if (v > 0) await tx.execute('DELETE FROM sync_meta');
        await tx.execute(`PRAGMA user_version = ${v + 1}`);
      });
    }
  }

  /** Una sola conexión: las escrituras se encadenan para que dos transacciones nunca se mezclen. */
  private write<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Aplica los cambios en orden y avanza el número hasta `seq`, todo o nada (plan §5.9). */
  apply(changes: Change[], seq: number): Promise<void> {
    return this.write(() => this.db.transaction((tx) => applyIn(tx, changes, seq)));
  }

  /** La instantánea (RF-CON-02, 09): borra la copia y guarda la nueva en la misma transacción. */
  replace(records: Change[], seq: number, meta: { epoch: string; schemaVersion: number }): Promise<void> {
    return this.write(() =>
      this.db.transaction(async (tx) => {
        await clearIn(tx);
        await applyIn(tx, records, seq);
        await tx.execute("INSERT INTO sync_meta (key, value) VALUES ('epoch', ?), ('schemaVersion', ?)", [
          meta.epoch,
          String(meta.schemaVersion),
        ]);
      }),
    );
  }

  async list<T = unknown>(entity: SyncEntity): Promise<T[]> {
    const rows = await this.db.query<{ payload: string }>(`SELECT payload FROM ${tableOf(entity)} ORDER BY id`);
    return rows.map((r) => JSON.parse(r.payload) as T);
  }

  async get<T = unknown>(entity: SyncEntity, id: string): Promise<T | null> {
    const [row] = await this.db.query<{ payload: string }>(`SELECT payload FROM ${tableOf(entity)} WHERE id = ?`, [id]);
    return row ? (JSON.parse(row.payload) as T) : null;
  }

  async seq(): Promise<number | null> {
    return (await this.meta()).seq;
  }

  async meta(): Promise<SyncMeta> {
    const rows = await this.db.query<{ key: string; value: string }>('SELECT key, value FROM sync_meta');
    const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      seq: v.seq !== undefined ? Number(v.seq) : null,
      epoch: v.epoch ?? null,
      schemaVersion: v.schemaVersion !== undefined ? Number(v.schemaVersion) : null,
      syncedAt: v.syncedAt ?? null,
      skewMs: v.skewMs !== undefined ? Number(v.skewMs) : null,
    };
  }

  setMeta(meta: Partial<Omit<SyncMeta, 'seq'>>): Promise<void> {
    return this.write(() =>
      this.db.transaction(async (tx) => {
        for (const [key, value] of Object.entries(meta))
          if (value !== null && value !== undefined)
            await tx.execute('INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)', [key, String(value)]);
      }),
    );
  }

  /** Borra la copia entera (cierre de sesión, revocación): se reconstruye con una instantánea. */
  clear(): Promise<void> {
    return this.write(() => this.db.transaction(clearIn));
  }

  /** Plan §5.9, "cada día": quita lo que tiene fecha de referencia anterior a `cutoff` (AAAA-MM-DD). */
  prune(cutoff: string): Promise<void> {
    return this.write(() =>
      this.db.transaction(async (tx) => {
        for (const entity of SYNC_ENTITIES)
          await tx.execute(`DELETE FROM ${tableOf(entity)} WHERE ref_date IS NOT NULL AND ref_date < ?`, [cutoff]);
      }),
    );
  }
}
