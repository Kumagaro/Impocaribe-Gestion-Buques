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
  // T092: las alertas que ve este usuario (RF-ALR-05).
  [entityTable('alert')],
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

/** Filas por sentencia: 4 parámetros cada una (800), por debajo incluso del límite antiguo de SQLite (999). */
const BATCH = 200;

/**
 * RNF-20: las altas van por lotes de una sentencia, porque en las apps cada sentencia es un viaje por el puente nativo
 * y la primera sincronización de un año serían decenas de miles. El lote se cierra al cambiar de tabla, ante una baja
 * (el orden importa) y ante un id repetido (un mismo INSERT … ON CONFLICT no puede tocar dos veces la misma fila).
 */
async function applyIn(tx: SqlExecutor, changes: Change[], seq: number): Promise<void> {
  let table = '';
  let rows: Change[] = [];
  const ids = new Set<string>();
  const flush = async () => {
    if (rows.length === 0) return;
    await tx.execute(
      `INSERT INTO ${table} (id, payload, ref_date, seq) VALUES ${rows.map(() => '(?, ?, ?, ?)').join(', ')}
       ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, ref_date = excluded.ref_date, seq = excluded.seq`,
      rows.flatMap((c) => [c.entityId, JSON.stringify(c.payload), c.refDate, c.seq]),
    );
    rows = [];
    ids.clear();
  };
  for (const c of changes) {
    const next = tableOf(c.entityType);
    if (next !== table || c.op === 'delete' || ids.has(c.entityId) || rows.length === BATCH) await flush();
    table = next;
    if (c.op === 'delete') await tx.execute(`DELETE FROM ${table} WHERE id = ?`, [c.entityId]);
    else {
      rows.push(c);
      ids.add(c.entityId);
    }
  }
  await flush();
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

  /** RF-ORD-06: los borradores que solo viven en este dispositivo (ni la sincronización ni el cierre de sesión los tocan). */
  async localDrafts<T>(): Promise<{ id: string; payload: T; updatedAt: string }[]> {
    const rows = await this.db.query<{ id: string; payload: string; updated_at: string }>(
      'SELECT id, payload, updated_at FROM local_drafts ORDER BY updated_at DESC',
    );
    return rows.map((r) => ({ id: r.id, payload: JSON.parse(r.payload) as T, updatedAt: r.updated_at }));
  }

  private draftListeners = new Set<() => void>();

  /** Avisa cuando cambian los borradores de este dispositivo (P-14 los muestra al momento). */
  onLocalDraftsChange(listener: () => void): () => void {
    this.draftListeners.add(listener);
    return () => this.draftListeners.delete(listener);
  }

  private draftsChanged = () => {
    for (const l of this.draftListeners) l();
  };

  saveLocalDraft(id: string, payload: unknown, updatedAt: string): Promise<void> {
    return this.write(() =>
      this.db.execute('INSERT OR REPLACE INTO local_drafts (id, payload, updated_at) VALUES (?, ?, ?)', [
        id,
        JSON.stringify(payload),
        updatedAt,
      ]),
    ).then(this.draftsChanged);
  }

  deleteLocalDraft(id: string): Promise<void> {
    return this.write(() => this.db.execute('DELETE FROM local_drafts WHERE id = ?', [id])).then(this.draftsChanged);
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
