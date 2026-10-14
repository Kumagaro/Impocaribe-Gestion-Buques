import { AppError } from '@impocaribe/shared';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { updateVersioned } from './versioned.ts';

// T015 · DT-23, RF-DM-12, Const. art. II.6: nadie sobrescribe en silencio el cambio de otro usuario.
const things = pgTable('cosas_editables', {
  id: uuid('id').primaryKey(),
  marca: text('marca').notNull(),
  rowVersion: integer('row_version').notNull(),
});
const ID = '0192a3b4-0000-7000-8000-0000000000aa';
let suite: SuiteDb;
let db: NodePgDatabase;

async function current() {
  const { rows } = await suite.admin.query('SELECT marca, row_version FROM cosas_editables WHERE id = $1', [ID]);
  return rows[0];
}

beforeAll(async () => {
  suite = await createSuiteDb();
  await suite.admin.query(
    'CREATE TABLE cosas_editables (id uuid PRIMARY KEY, marca text NOT NULL, row_version int NOT NULL); GRANT SELECT, INSERT, UPDATE ON cosas_editables TO impocaribe_app',
  );
  db = drizzle(suite.app);
}, 60_000);

afterAll(async () => {
  await suite.drop();
});

beforeEach(async () => {
  await suite.admin.query('TRUNCATE cosas_editables');
  await suite.admin.query("INSERT INTO cosas_editables VALUES ($1, 'NEVADA', 1)", [ID]);
});

describe('DT-23: row_version y expectedVersion', () => {
  it('con la versión esperada aplica el cambio e incrementa row_version', async () => {
    const row = await db.transaction((tx) => updateVersioned(tx, things, ID, 1, { marca: 'NEVADA PLUS' }));
    expect(row).toEqual({ id: ID, marca: 'NEVADA PLUS', rowVersion: 2 });
    expect(await current()).toEqual({ marca: 'NEVADA PLUS', row_version: 2 });
  });

  it('con una versión vieja responde STALE_RECORD con la versión actual y no cambia nada', async () => {
    await db.transaction((tx) => updateVersioned(tx, things, ID, 1, { marca: 'PRIMERA' }));
    const attempt = db.transaction((tx) => updateVersioned(tx, things, ID, 1, { marca: 'SEGUNDA' }));
    await expect(attempt).rejects.toEqual(
      new AppError(
        'STALE_RECORD',
        'Otro usuario modificó este registro. Revise sus cambios sobre la versión actual y vuelva a guardar.',
        {
          currentVersion: 2,
        },
      ),
    );
    expect(await current()).toEqual({ marca: 'PRIMERA', row_version: 2 });
  });

  it('dos ediciones simultáneas con la misma versión: una gana y la otra recibe STALE_RECORD', async () => {
    const results = await Promise.allSettled([
      db.transaction((tx) => updateVersioned(tx, things, ID, 1, { marca: 'USUARIO-A' })),
      db.transaction((tx) => updateVersioned(tx, things, ID, 1, { marca: 'USUARIO-B' })),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost.map((r) => (r.reason as AppError).code)).toEqual(['STALE_RECORD']);
    const winner = (won[0] as PromiseFulfilledResult<{ marca: string }>).value.marca;
    expect(await current()).toEqual({ marca: winner, row_version: 2 });
  });

  it('un registro inexistente responde NOT_FOUND', async () => {
    const attempt = db.transaction((tx) =>
      updateVersioned(tx, things, '0192a3b4-0000-7000-8000-0000000000bb', 1, { marca: 'X' }),
    );
    await expect(attempt).rejects.toEqual(new AppError('NOT_FOUND', 'El registro no existe.'));
  });
});
