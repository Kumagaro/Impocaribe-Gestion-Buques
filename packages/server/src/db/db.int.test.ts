import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';

// T012 · plan §4 (convenciones: uuid v7), §9 (rol de la app y trigger de solo inserción) y base limpia por suite.
let suite: SuiteDb;

beforeAll(async () => {
  suite = await createSuiteDb();
}, 60_000);

afterAll(async () => {
  await suite.drop();
});

describe('plan §9: rol de la aplicación', () => {
  it('las conexiones de la app trabajan con el rol impocaribe_app', async () => {
    const { rows } = await suite.app.query<{ current_user: string }>('SELECT current_user');
    expect(rows[0]!.current_user).toBe('impocaribe_app');
  });

  it('el rol de la app no puede cambiar el esquema', async () => {
    // 42501 = insufficient_privilege (el texto depende del idioma del servidor PostgreSQL)
    await expect(suite.app.query('CREATE TABLE intruso (x int)')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('Const. art. IV: assert_append_only()', () => {
  beforeAll(async () => {
    await suite.admin.query(`
      CREATE TABLE registro_ejemplo (id int PRIMARY KEY, texto text);
      CREATE TRIGGER registro_ejemplo_solo_insercion BEFORE UPDATE OR DELETE ON registro_ejemplo
        FOR EACH ROW EXECUTE FUNCTION assert_append_only();
      GRANT SELECT, INSERT, UPDATE, DELETE ON registro_ejemplo TO impocaribe_app;
    `);
  });

  it('permite insertar', async () => {
    await suite.app.query("INSERT INTO registro_ejemplo VALUES (1, 'original')");
    const { rows } = await suite.app.query('SELECT texto FROM registro_ejemplo WHERE id = 1');
    expect(rows).toEqual([{ texto: 'original' }]);
  });

  it('rechaza UPDATE aunque el rol tenga el permiso', async () => {
    await expect(suite.app.query("UPDATE registro_ejemplo SET texto = 'cambiado'")).rejects.toThrow(
      'La tabla registro_ejemplo es de solo inserción: sus registros no se modifican ni se borran (Const. art. IV).',
    );
  });

  it('rechaza DELETE aunque el rol tenga el permiso', async () => {
    await expect(suite.app.query('DELETE FROM registro_ejemplo')).rejects.toThrow(
      'La tabla registro_ejemplo es de solo inserción: sus registros no se modifican ni se borran (Const. art. IV).',
    );
  });

  it('el registro sigue intacto', async () => {
    const { rows } = await suite.app.query('SELECT id, texto FROM registro_ejemplo');
    expect(rows).toEqual([{ id: 1, texto: 'original' }]);
  });
});

describe('plan §4: identificadores uuid v7', () => {
  it('uuid_generate_v7() genera UUID de versión 7 ordenables por tiempo de creación', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { rows } = await suite.app.query<{ id: string }>('SELECT uuid_generate_v7()::text AS id');
      ids.push(rows[0]!.id);
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(ids.map((id) => id[14])).toEqual(['7', '7', '7', '7', '7']);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe('migraciones y base limpia por suite', () => {
  it('la migración inicial queda registrada en Drizzle', async () => {
    const { rows } = await suite.admin.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations',
    );
    expect(rows[0]!.n).toBe('1');
  });

  it('cada suite tiene su propia base terminada en _test, distinta de la plantilla y de la de desarrollo', async () => {
    const template = new URL(config().databaseUrl).pathname.slice(1);
    expect(suite.name.endsWith('_test')).toBe(true);
    expect(suite.name).not.toBe(template);
    expect(suite.name).not.toBe('impocaribe_dev');
  });
});
