// T044 · DT-03: la base local sobre sql.js (SQLite compilado a WebAssembly), sin cifrar. La usan las pruebas y el
// navegador de desarrollo; las apps abren la suya, cifrada con SQLCipher, desde el cascarón (T115, T118).
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type { LocalDatabase, SqlExecutor, SqlValue } from './platform';

let sqlJs: Promise<SqlJsStatic> | null = null;

function executor(db: Database): SqlExecutor {
  return {
    async execute(sql, params = []) {
      db.run(sql, params);
    },
    async query<T>(sql: string, params: SqlValue[] = []) {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        const rows: T[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
        return rows;
      } finally {
        stmt.free();
      }
    },
  };
}

function localDatabase(db: Database): LocalDatabase {
  const base = executor(db);
  return {
    ...base,
    async transaction(fn) {
      db.run('BEGIN');
      try {
        const result = await fn(base);
        db.run('COMMIT');
        return result;
      } catch (err) {
        db.run('ROLLBACK');
        throw err;
      }
    },
  };
}

/** Una base en memoria. `locateFile` dice dónde está sql-wasm.wasm (en el navegador lo resuelve vite). */
export async function openSqlJsDatabase(locateFile?: (file: string) => string): Promise<LocalDatabase> {
  sqlJs ??= initSqlJs(locateFile ? { locateFile } : undefined);
  const SQL = await sqlJs;
  return localDatabase(new SQL.Database());
}
