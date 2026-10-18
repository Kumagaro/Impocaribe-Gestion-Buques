import { ManualClock, signRequest } from '@impocaribe/shared';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appHeaders, createTestApp, deviceSecret, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { createUser } from '../users/users.repo.ts';
import { purgeChangeLog, SNAPSHOT_PAGE } from './sync.controller.ts';

// T042 · plan §4.4, §5.9 y §6.2 (Sincronización): RF-CON-02, 03, 09 y 10. Cada rol recibe solo su audiencia; los
// números avanzan en orden; lo depurado obliga a reconstruir la copia.
let suite: SuiteDb;
let t: TestApp;
const clock = new ManualClock('2026-10-14T12:00:00.000Z');
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

const people = [
  ['ana', 'Ana Apoderada', 'apoderada', '84011905548'],
  ['mario', 'Mario Operador', 'operador', '85020306548'],
  ['oscar', 'Oscar Lectura', 'lectura', '86030406548'],
] as const;

const get = (who: string, path: string) =>
  t.fetch(`${t.base}${path}`, { headers: appHeaders({ Authorization: `Bearer ${tokens[who]}` }) });
const json = async <T>(res: Response) => {
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as T;
};
interface Changes {
  changes: { seq: number; entityType: string; entityId: string; op: string; payload: Record<string, unknown> }[];
  nextSince: number;
  hasMore: boolean;
}
interface Snapshot {
  epoch: string;
  seq: number;
  records: { entityType: string; entityId: string; payload: Record<string, unknown> }[];
  nextCursor: string | null;
}

async function login(username: string) {
  const res = await t.fetch(`${t.base}/auth/login`, {
    method: 'POST',
    headers: appHeaders(),
    body: JSON.stringify({
      username,
      password: 'contraseña1',
      deviceId: `pc-${username}`,
      deviceLabel: 'PC',
      platform: 'windows',
    }),
  });
  return ((await res.json()) as { token: string }).token;
}

beforeAll(async () => {
  suite = await createSuiteDb();
  t = await createTestApp(suite, clock);
}, 60_000);

afterAll(async () => {
  await t.close();
  await suite.drop();
});

beforeEach(async () => {
  clock.set('2026-10-14T12:00:00.000Z');
  await suite.admin.query(
    `TRUNCATE users CASCADE; TRUNCATE idempotency_keys;
     ALTER TABLE change_log DISABLE TRIGGER USER; TRUNCATE change_log; ALTER TABLE change_log ENABLE TRIGGER USER;
     UPDATE sync_state SET last_seq = 0`,
  );
  const db = drizzle(suite.app);
  for (const [username, fullName, role, nationalId] of people) {
    const user = await db.transaction((tx) =>
      createUser(
        tx,
        clock,
        newUserSchema.parse({
          fullName,
          username,
          nationalId,
          phone: '52345678',
          role,
          password: 'contraseña1',
          confirm: 'contraseña1',
        }),
      ),
    );
    ids[username] = user.id;
  }
  for (const [username] of people) tokens[username] = await login(username);
}, 120_000);

describe('GET /sync/state (RF-CON-03, 10)', () => {
  it('devuelve la época, el último número, la versión del formato y la hora del servidor', async () => {
    const { rows } = await suite.admin.query('SELECT epoch::text, last_seq::int FROM sync_state');
    const state = await json<Record<string, unknown>>(await get('mario', '/sync/state'));
    expect(state).toEqual({
      epoch: rows[0].epoch,
      lastSeq: rows[0].last_seq,
      schemaVersion: 1,
      serverTime: '2026-10-14T12:00:00.000Z',
    });
  });

  it('mide el desfase de la hora del dispositivo aunque supere 5 min, y desde entonces sus peticiones valen', async () => {
    const deviceId = 'pc-mario';
    const skewed = async (path: string) => {
      // El reloj del dispositivo va 10 minutos adelantado.
      const time = String(clock.now().getTime() + 10 * 60_000 + Math.floor(Math.random() * 1000));
      const signature = await signRequest(
        { method: 'GET', path: `/api/v1${path}`, time, body: '' },
        deviceSecret(deviceId),
      );
      return fetch(`${t.base}${path}`, {
        headers: appHeaders({
          Authorization: `Bearer ${tokens.mario}`,
          'X-Device-Id': deviceId,
          'X-Device-Time': time,
          'X-Device-Signature': signature,
        }),
      });
    };
    // Sin medir el desfase, cualquier otra ruta lo rechaza (DT-24).
    const before = await skewed('/auth/me');
    expect([before.status, ((await before.json()) as { code: string }).code]).toEqual([403, 'DEVICE_NOT_PAIRED']);
    expect((await skewed('/sync/state')).status).toBe(200);
    const { rows } = await suite.admin.query('SELECT clock_offset_ms::int AS ms FROM devices WHERE id = $1', [
      deviceId,
    ]);
    expect(rows[0].ms).toBeGreaterThanOrEqual(10 * 60_000);
    expect(rows[0].ms).toBeLessThan(10 * 60_000 + 1000);
    expect((await skewed('/auth/me')).status).toBe(200);
  });

  it('sin sesión no se sirve', async () => {
    const res = await t.fetch(`${t.base}/sync/state`, { headers: appHeaders() });
    expect(res.status).toBe(401);
  });
});

describe('GET /sync/changes (RF-CON-03, plan §5.9)', () => {
  it('un usuario nuevo produce su entrada del directorio para todos y su ficha completa solo para la Apoderada', async () => {
    const res = await t.fetch(`${t.base}/users`, {
      method: 'POST',
      headers: appHeaders({ Authorization: `Bearer ${tokens.ana}` }),
      body: JSON.stringify({
        fullName: 'Yanet Ruiz Castro',
        username: 'yanet.ruiz',
        nationalId: '90051212345',
        phone: '53456789',
        role: 'operador',
        password: 'temporal-1',
        confirm: 'temporal-1',
      }),
    });
    expect(res.status).toBe(201);
    const id = ((await res.json()) as { user: { id: string } }).user.id;

    const forAna = await json<Changes>(await get('ana', '/sync/changes?since=0'));
    const mine = forAna.changes.filter((c) => c.entityId === id);
    expect(mine.map((c) => [c.entityType, c.op])).toEqual([
      ['user_directory', 'upsert'],
      ['user_admin', 'upsert'],
    ]);
    expect(mine[0]!.payload).toEqual({ id, fullName: 'Yanet Ruiz Castro', role: 'operador', active: true });
    expect(mine[1]!.payload).toMatchObject({
      id,
      username: 'yanet.ruiz',
      nationalId: '90051212345',
      phone: '53456789',
      lastAccessAt: null,
    });
    expect(mine[1]!.payload).not.toHaveProperty('passwordHash');

    for (const who of ['mario', 'oscar']) {
      const seen = await json<Changes>(await get(who, '/sync/changes?since=0'));
      expect(seen.changes.filter((c) => c.entityId === id).map((c) => c.entityType)).toEqual(['user_directory']);
      expect(seen.changes.some((c) => c.entityType === 'user_admin')).toBe(false);
    }
  });

  it('en orden y por páginas; nextSince avanza también sobre lo que su rol no ve', async () => {
    const all = await json<Changes>(await get('ana', '/sync/changes?since=0'));
    const { rows } = await suite.admin.query('SELECT last_seq::int FROM sync_state');
    const last = rows[0].last_seq as number;
    expect(all.changes.map((c) => c.seq)).toEqual([...all.changes.map((c) => c.seq)].sort((a, b) => a - b));
    expect([all.nextSince, all.hasMore]).toEqual([last, false]);

    const page = await json<Changes>(await get('ana', '/sync/changes?since=0&limit=2'));
    expect(page.changes.map((c) => c.seq)).toEqual(all.changes.slice(0, 2).map((c) => c.seq));
    expect([page.nextSince, page.hasMore]).toEqual([all.changes[1]!.seq, true]);

    const forOscar = await json<Changes>(await get('oscar', '/sync/changes?since=0'));
    expect(forOscar.nextSince).toBe(last);
    expect(forOscar.changes.every((c) => c.entityType === 'user_directory')).toBe(true);
  });

  it('desde el último número no hay nada nuevo', async () => {
    const { rows } = await suite.admin.query('SELECT last_seq::int FROM sync_state');
    const res = await json<Changes>(await get('mario', `/sync/changes?since=${rows[0].last_seq}`));
    expect(res).toEqual({ changes: [], nextSince: rows[0].last_seq, hasMore: false });
  });

  it('RF-CON-09: un número mayor que el último (otra época) o ya depurado responde 410 RESYNC_REQUIRED', async () => {
    const { rows } = await suite.admin.query('SELECT last_seq::int FROM sync_state');
    const ahead = await get('mario', `/sync/changes?since=${rows[0].last_seq + 5}`);
    expect([ahead.status, ((await ahead.json()) as { code: string }).code]).toEqual([410, 'RESYNC_REQUIRED']);

    // Lo que tiene más de 30 días se depura: quien sincronizó por última vez antes de eso debe reconstruir. Los
    // cambios se envejecen en la base (si se adelantara el reloj, vencería también la sesión).
    await suite.admin.query(
      `ALTER TABLE change_log DISABLE TRIGGER USER;
       UPDATE change_log SET committed_at = committed_at - interval '30 days 1 second';
       ALTER TABLE change_log ENABLE TRIGGER USER;`,
    );
    expect(await purgeChangeLog(drizzle(suite.app), clock)).toBe(rows[0].last_seq);
    const old = await get('mario', '/sync/changes?since=0');
    expect([old.status, ((await old.json()) as { code: string }).code]).toEqual([410, 'RESYNC_REQUIRED']);
    // Al día, en cambio, no hay nada que pedir y responde normalmente.
    const fresh = await get('mario', `/sync/changes?since=${rows[0].last_seq}`);
    expect(fresh.status).toBe(200);
  });

  it('la depuración solo borra lo que tiene más de 30 días', async () => {
    const before = (await suite.admin.query('SELECT count(*)::int AS n FROM change_log')).rows[0].n as number;
    // Exactamente 30 días: todavía se guardan.
    await suite.admin.query(
      `ALTER TABLE change_log DISABLE TRIGGER USER;
       UPDATE change_log SET committed_at = committed_at - interval '30 days';
       ALTER TABLE change_log ENABLE TRIGGER USER;`,
    );
    expect(await purgeChangeLog(drizzle(suite.app), clock)).toBe(0);
    expect((await suite.admin.query('SELECT count(*)::int AS n FROM change_log')).rows[0].n).toBe(before);
  });

  it('valida la consulta', async () => {
    expect((await get('mario', '/sync/changes')).status).toBe(400);
    expect((await get('mario', '/sync/changes?since=-1')).status).toBe(400);
    expect((await get('mario', '/sync/changes?since=0&limit=5000')).status).toBe(400);
  });
});

describe('GET /sync/snapshot (RF-CON-02)', () => {
  async function snapshot(who: string) {
    const pages: Snapshot[] = [];
    let cursor: string | null = null;
    do {
      const page: Snapshot = await json<Snapshot>(
        await get(who, `/sync/snapshot${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
      );
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor);
    return pages;
  }

  it('la Apoderada recibe el directorio y las fichas; los demás roles, solo el directorio', async () => {
    const { rows } = await suite.admin.query('SELECT epoch::text, last_seq::int FROM sync_state');
    const [ana] = await snapshot('ana');
    expect([ana!.epoch, ana!.seq, ana!.nextCursor]).toEqual([rows[0].epoch, rows[0].last_seq, null]);
    const kinds = (s: Snapshot) => s.records.map((r) => `${r.entityType}:${r.entityId}`).sort();
    const everyone = Object.values(ids).map((id) => `user_directory:${id}`);
    expect(kinds(ana!)).toEqual([...everyone, ...Object.values(ids).map((id) => `user_admin:${id}`)].sort());
    expect(ana!.records.find((r) => r.entityType === 'user_admin' && r.entityId === ids.mario)!.payload).toMatchObject({
      username: 'mario',
      role: 'operador',
      lastAccessAt: '2026-10-14T12:00:00.000Z',
    });
    for (const who of ['mario', 'oscar']) {
      const [page] = await snapshot(who);
      expect(kinds(page!)).toEqual(everyone.sort());
    }
  });

  it(`por páginas de ${SNAPSHOT_PAGE} registros, sin repetir ni saltar ninguno`, async () => {
    await suite.admin.query(
      `INSERT INTO users (username, full_name, national_id, phone, role, password_hash, created_at, updated_at)
       SELECT 'usr' || g, 'Usuario ' || g, '7' || lpad(g::text, 10, '0'), '52345678', 'lectura', 'x', now(), now()
       FROM generate_series(1, ${SNAPSHOT_PAGE + 10}) g`,
    );
    const pages = await snapshot('oscar');
    expect(pages.map((p) => p.records.length)).toEqual([SNAPSHOT_PAGE, 13]);
    const seen = pages.flatMap((p) => p.records.map((r) => r.entityId));
    expect(new Set(seen).size).toBe(SNAPSHOT_PAGE + 13);
  }, 60_000);

  it('un cursor que no es suyo se rechaza', async () => {
    const res = await get('mario', '/sync/snapshot?cursor=no-es-un-cursor');
    expect([res.status, ((await res.json()) as { code: string }).code]).toEqual([400, 'VALIDATION_ERROR']);
  });
});
