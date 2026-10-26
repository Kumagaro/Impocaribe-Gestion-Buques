// T115 · DT-03 (decisión del responsable del 2026-10-24): la copia local de escritorio en SQLite cifrado con SQLCipher,
// con better-sqlite3-multiple-ciphers en el proceso principal. La clave es aleatoria (256 bits) y se guarda en el
// almacenamiento seguro; sin ella el archivo no se puede leer. La interfaz la usa por IPC (db.open, db.execute, db.query).
import Database from 'better-sqlite3-multiple-ciphers';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { SecureStore } from './secure-storage.ts';

export type SqlValue = string | number | null | Uint8Array;
type Row = Record<string, SqlValue>;

const KEY_PREFIX = 'impocaribe.db-key.';
/** Un nombre de base es una palabra: nunca una ruta. */
const NAME = /^[a-z0-9_-]{1,40}$/i;

/**
 * El SQL llega del renderizador: aunque la interfaz es nuestra, un fallo en ella no debe poder escribir archivos fuera de
 * la base (ATTACH, VACUUM INTO) ni cambiar el cifrado (PRAGMA key, cipher…). La copia local solo necesita leer y fijar
 * `PRAGMA user_version` para sus migraciones.
 */
const FORBIDDEN = /\b(ATTACH|DETACH|VACUUM|LOAD_EXTENSION)\b/i;
const PRAGMA = /\bPRAGMA\b/gi;
const USER_VERSION = /^\s*PRAGMA\s+user_version\s*(=\s*\d+\s*)?;?\s*$/i;
export function allowed(sql: string): void {
  const pragmas = sql.match(PRAGMA)?.length ?? 0;
  if (FORBIDDEN.test(sql) || (pragmas > 0 && (pragmas > 1 || !USER_VERSION.test(sql))))
    throw new Error('Sentencia no permitida en la copia local.');
}

const toSql = (params: SqlValue[]) => params.map((p) => (p instanceof Uint8Array ? Buffer.from(p) : p));
const fromSql = (row: Row): Row =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Buffer.isBuffer(v) ? new Uint8Array(v) : v]));

export class LocalDatabases {
  private readonly open = new Map<number, Database.Database>();
  private next = 1;

  constructor(
    private readonly dir: string,
    private readonly secure: SecureStore,
  ) {}

  /** Abre (o crea) la base con su clave; una clave equivocada falla aquí, no a mitad de una consulta. */
  async openDatabase(name: string): Promise<number> {
    if (!NAME.test(name)) throw new Error(`Nombre de base no válido: ${name}`);
    let key = this.secure.get(KEY_PREFIX + name);
    if (!key) {
      key = randomBytes(32).toString('hex');
      await this.secure.set(KEY_PREFIX + name, key);
    }
    const db = new Database(join(this.dir, `${name}.db`));
    db.pragma(`cipher='sqlcipher'`);
    db.pragma(`key="x'${key}'"`);
    db.prepare('SELECT count(*) FROM sqlite_master').get();
    db.pragma('journal_mode = WAL');
    const id = this.next++;
    this.open.set(id, db);
    return id;
  }

  /** Una o varias sentencias; con parámetros, una sola. */
  execute(id: number, sql: string, params: SqlValue[] = []): void {
    const db = this.db(id);
    allowed(sql);
    if (params.length === 0) db.exec(sql);
    else db.prepare(sql).run(...toSql(params));
  }

  query(id: number, sql: string, params: SqlValue[] = []): Row[] {
    allowed(sql);
    return (
      this.db(id)
        .prepare(sql)
        .all(...toSql(params)) as Row[]
    ).map(fromSql);
  }

  closeAll(): void {
    for (const db of this.open.values()) db.close();
    this.open.clear();
  }

  private db(id: number): Database.Database {
    const db = this.open.get(id);
    if (!db) throw new Error('La base local no está abierta.');
    return db;
  }
}
