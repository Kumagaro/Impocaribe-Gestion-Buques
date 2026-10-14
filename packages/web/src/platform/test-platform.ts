// T019 · Implementación de prueba de `platform` (DT-03): SQLite real en memoria con sql.js, almacenamiento seguro en
// memoria y registro de las llamadas al sistema para que las pruebas de componente las comprueben.
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type {
  DeviceInfo,
  HttpTransport,
  LocalDatabase,
  Platform,
  PlatformSocket,
  SqlExecutor,
  SqlValue,
} from './platform';

export type TestPlatform = Platform & { calls: { method: string; args: unknown[] }[] };

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

export async function createTestPlatform(
  options: { deviceInfo?: DeviceInfo; http?: HttpTransport; ws?: (url: string) => PlatformSocket } = {},
): Promise<TestPlatform> {
  sqlJs ??= initSqlJs();
  const SQL = await sqlJs;
  const info: DeviceInfo = options.deviceInfo ?? { platform: 'windows', appVersion: '0.0.0', smallestWidthDp: 768 };
  const secrets = new Map<string, string>();
  const calls: TestPlatform['calls'] = [];
  const record =
    (method: string) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
    };
  return {
    calls,
    deviceInfo: () => info,
    // Para probar contra un servidor real, se pasa el transporte Node de @impocaribe/shared/node, que verifica la identidad.
    http:
      options.http ??
      (async () => {
        throw new Error('La plataforma de prueba no tiene transporte HTTP: pase uno en createTestPlatform({ http }).');
      }),
    ws:
      options.ws ??
      (() => {
        throw new Error('La plataforma de prueba no tiene WebSocket: pase uno en createTestPlatform({ ws }).');
      }),
    secureStorage: {
      get: async (key) => secrets.get(key) ?? null,
      set: async (key, value) => {
        secrets.set(key, value);
      },
      remove: async (key) => {
        secrets.delete(key);
      },
    },
    openDatabase: async () => localDatabase(new SQL.Database()),
    saveFile: record('saveFile'),
    notify: record('notify'),
    secureScreen: record('secureScreen'),
    installUpdate: record('installUpdate'),
  };
}
