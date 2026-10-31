// El paquete trae sus tipos (index.d.ts) pero no los publica en "exports": se declara aquí lo que usa database.ts.
declare module 'better-sqlite3-multiple-ciphers' {
  namespace Database {
    interface Statement {
      run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    }
    interface Database {
      pragma(source: string): unknown;
      prepare(sql: string): Statement;
      exec(sql: string): this;
      close(): this;
    }
  }
  const Database: new (filename: string) => Database.Database;
  export default Database;
}
