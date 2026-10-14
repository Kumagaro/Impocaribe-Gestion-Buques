import { randomUUID } from 'node:crypto';
import { ManualClock } from '@impocaribe/shared';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { recordChanges, type Change } from './change-log.ts';

// T014 · DT-04 y plan §5.9: el registro de cambios numera en orden de commit, sin huecos visibles, y una transacción
// revertida no deja cambios.
let suite: SuiteDb;
let db: NodePgDatabase;
const clock = new ManualClock('2026-10-14T12:00:00.000Z');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function change(n: number): Change {
  return {
    entityType: 'vessel',
    entityId: randomUUID(),
    op: 'upsert',
    audience: 'all',
    payload: { n },
    refDate: '2026-10-14',
  };
}

async function seqs(): Promise<number[]> {
  const { rows } = await suite.admin.query<{ seq: string }>('SELECT seq FROM change_log ORDER BY seq');
  return rows.map((r) => Number(r.seq));
}

async function lastSeq(): Promise<number> {
  const { rows } = await suite.admin.query<{ last_seq: string }>('SELECT last_seq FROM sync_state');
  return Number(rows[0]!.last_seq);
}

beforeAll(async () => {
  suite = await createSuiteDb();
  db = drizzle(suite.app);
}, 60_000);

afterAll(async () => {
  await suite.drop();
});

beforeEach(async () => {
  await suite.admin.query('TRUNCATE change_log; UPDATE sync_state SET last_seq = 0');
});

describe('plan §4.4: sync_state', () => {
  it('existe una sola fila, con época, versión de esquema 1 y último número 0', async () => {
    const { rows } = await suite.admin.query('SELECT id, last_seq::int, schema_version, epoch::text FROM sync_state');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 1, last_seq: 0, schema_version: 1 });
    expect(rows[0].epoch).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('no admite una segunda fila', async () => {
    await expect(suite.admin.query('INSERT INTO sync_state (id) VALUES (2)')).rejects.toMatchObject({ code: '23514' });
  });
});

describe('DT-04: recordChanges', () => {
  it('numera los cambios desde last_seq + 1, los guarda con su contenido y devuelve el último número', async () => {
    const changes = [change(1), change(2), change(3)];
    const last = await db.transaction((tx) => recordChanges(tx, clock, changes));
    expect(last).toBe(3);
    expect(await lastSeq()).toBe(3);
    const { rows } = await suite.admin.query(
      `SELECT seq::int, entity_type, entity_id::text, op, audience, payload, ref_date::text, committed_at
         FROM change_log ORDER BY seq`,
    );
    expect(rows).toEqual(
      changes.map((c, i) => ({
        seq: i + 1,
        entity_type: 'vessel',
        entity_id: c.entityId,
        op: 'upsert',
        audience: 'all',
        payload: { n: i + 1 },
        ref_date: '2026-10-14',
        committed_at: new Date('2026-10-14T12:00:00.000Z'),
      })),
    );
  });

  it('continúa la numeración en la siguiente transacción', async () => {
    await db.transaction((tx) => recordChanges(tx, clock, [change(1), change(2)]));
    const last = await db.transaction((tx) => recordChanges(tx, clock, [change(3)]));
    expect(last).toBe(3);
    expect(await seqs()).toEqual([1, 2, 3]);
  });

  it('sin cambios no consume números y devuelve el último confirmado', async () => {
    await db.transaction((tx) => recordChanges(tx, clock, [change(1)]));
    expect(await db.transaction((tx) => recordChanges(tx, clock, []))).toBe(1);
    expect(await lastSeq()).toBe(1);
  });

  it('una transacción revertida no deja cambios ni consume números', async () => {
    await expect(
      db.transaction(async (tx) => {
        await recordChanges(tx, clock, [change(1), change(2)]);
        throw new Error('la operación falló antes del COMMIT');
      }),
    ).rejects.toThrow('la operación falló antes del COMMIT');
    expect(await seqs()).toEqual([]);
    expect(await lastSeq()).toBe(0);
    await db.transaction((tx) => recordChanges(tx, clock, [change(3)]));
    expect(await seqs()).toEqual([1]);
  });

  it('50 transacciones concurrentes: un lector nunca ve huecos y al final los números son 1..N sin repetir', async () => {
    const sizes = Array.from({ length: 50 }, (_, i) => (i % 3) + 1); // 1, 2 o 3 cambios por transacción
    const total = sizes.reduce((a, b) => a + b, 0);
    let writing = true;
    const gaps: number[][] = [];
    const reader = (async () => {
      while (writing) {
        const seen = await seqs();
        if (seen.some((s, i) => s !== i + 1)) gaps.push(seen);
        await sleep(1);
      }
    })();
    await Promise.all(
      sizes.map((n, i) =>
        db.transaction(async (tx) => {
          await sleep((i * 7) % 13); // trabajo previo de duración variable
          await recordChanges(
            tx,
            clock,
            Array.from({ length: n }, (_, k) => change(k)),
          );
          await sleep((i * 5) % 11); // el COMMIT llega más tarde, con el bloqueo de sync_state retenido
        }),
      ),
    );
    writing = false;
    await reader;
    expect(gaps).toEqual([]);
    expect(await seqs()).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    expect(await lastSeq()).toBe(total);
  });
});

describe('plan §4.4: change_log es de solo inserción', () => {
  it('rechaza UPDATE', async () => {
    await db.transaction((tx) => recordChanges(tx, clock, [change(1)]));
    await expect(suite.admin.query("UPDATE change_log SET audience = 'editors'")).rejects.toThrow(
      'La tabla change_log es de solo inserción: sus registros no se modifican ni se borran (Const. art. IV).',
    );
  });

  it('solo admite las operaciones upsert y delete', async () => {
    await expect(
      suite.admin.query(
        `INSERT INTO change_log VALUES (99, 'vessel', uuid_generate_v7(), 'update', 'all', '{}', NULL, now())`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
