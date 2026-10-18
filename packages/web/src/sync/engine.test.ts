import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSyncServer, type SyncServer } from '../../test/sync-server';
import { createApiClient } from '../api/client';
import { LocalStore } from '../local/local-store';
import { createTestPlatform } from '../platform/test-platform';
import { SyncEngine, RECONNECT_MAX_MS, POLL_MS, type SyncChanged } from './engine';

// T045 · plan §5.9 y §6.4: el motor de sincronización. RF-CON-03 (al día sola y solo lo que cambió), RF-CON-04 (los
// datos llegan calculados), RF-CON-09 (reconstruye la copia), RF-CON-10 (mide la hora del servidor).
const id = (n: number) => `0199f0a1-0000-7000-8000-${String(n).padStart(12, '0')}`;
const user = (n: number, name = `Usuario ${n}`) => ({ id: id(n), fullName: name, role: 'operador', active: true });
const engines: SyncEngine[] = [];

async function setup(server: SyncServer, extra: { onRevoked?: (kind: 'session' | 'device') => void } = {}) {
  const store = await LocalStore.open(await createTestPlatform());
  const api = createApiClient({
    baseUrl: 'https://servidor.test/api/v1',
    appVersion: '1.0.0',
    getToken: async () => 'token-1',
    now: () => new Date('2026-10-14T16:41:00.000Z'),
    transport: server.transport,
  });
  const changed: SyncChanged[] = [];
  const engine = new SyncEngine({
    store,
    api: () => api,
    socket: server.socket,
    wsUrl: () => 'wss://servidor.test/api/v1/ws',
    token: () => 'token-1',
    now: () => new Date('2026-10-14T16:41:00.000Z'),
    onRevoked: extra.onRevoked ?? (() => undefined),
  });
  engine.onChange((c) => changed.push(c));
  engines.push(engine);
  return { store, engine, changed };
}

/** La copia local como entidad → id → payload, para compararla con lo que el servidor dice que debe tener. */
async function copy(store: LocalStore) {
  const out: Record<string, Record<string, unknown>> = {};
  for (const entity of ['user_directory', 'user_admin'] as const)
    for (const p of await store.list<{ id: string }>(entity)) (out[entity] ??= {})[p.id] = p;
  return out;
}

afterEach(() => {
  for (const e of engines.splice(0)) e.stop();
  vi.useRealTimers();
});

describe('primera sincronización (RF-CON-02, RNF-20)', () => {
  it('descarga la instantánea por páginas y luego los cambios posteriores, y queda al día', async () => {
    const server = createSyncServer({ pageSize: 2 });
    for (let n = 1; n <= 5; n++)
      server.write({
        entityType: 'user_directory',
        entityId: id(n),
        op: 'upsert',
        audience: 'all',
        payload: user(n),
        refDate: null,
      });
    const { store, engine } = await setup(server);
    await engine.syncNow();
    expect(await copy(store)).toEqual(server.expected());
    expect(server.calls.filter((c) => c.startsWith('/sync/snapshot'))).toEqual([
      '/sync/snapshot',
      '/sync/snapshot?cursor=2',
      '/sync/snapshot?cursor=4',
    ]);
    expect(await store.meta()).toEqual({
      seq: 5,
      epoch: server.epoch,
      schemaVersion: 1,
      syncedAt: '2026-10-14T16:40:00.000Z',
      // El dispositivo marca 16:41 y el servidor 16:40.
      skewMs: 60_000,
    });
    expect(engine.status()).toMatchObject({ stage: 'ready', online: true, hasData: true, received: 5 });
  });

  it('con datos ya descargados de la misma época, solo pide lo que cambió (RF-CON-03)', async () => {
    const server = createSyncServer();
    server.write({
      entityType: 'user_directory',
      entityId: id(1),
      op: 'upsert',
      audience: 'all',
      payload: user(1),
      refDate: null,
    });
    const { store, engine } = await setup(server);
    await engine.syncNow();
    server.calls.length = 0;
    server.write({
      entityType: 'user_directory',
      entityId: id(2),
      op: 'upsert',
      audience: 'all',
      payload: user(2),
      refDate: null,
    });
    await engine.syncNow();
    expect(server.calls).toEqual(['/sync/state', '/sync/changes?since=1&limit=500']);
    expect(await copy(store)).toEqual(server.expected());
  });

  it('solo guarda lo que su rol ve', async () => {
    const server = createSyncServer({ role: 'lectura' });
    server.write({
      entityType: 'user_directory',
      entityId: id(1),
      op: 'upsert',
      audience: 'all',
      payload: user(1),
      refDate: null,
    });
    server.write({
      entityType: 'user_admin',
      entityId: id(1),
      op: 'upsert',
      audience: 'apoderada',
      payload: { id: id(1), phone: '52345678' },
      refDate: null,
    });
    const { store, engine } = await setup(server);
    await engine.syncNow();
    expect(await store.list('user_admin')).toEqual([]);
    expect(await store.list('user_directory')).toEqual([user(1)]);
  });
});

describe('avisos y reconexión (plan §6.4)', () => {
  it('se autentica en el WebSocket y con sync.available descarga el cambio y avisa a las pantallas', async () => {
    const server = createSyncServer();
    const { store, engine, changed } = await setup(server);
    engine.start();
    await vi.waitFor(() => expect(engine.status().stage).toBe('ready'));
    await vi.waitFor(() => expect(server.sockets).toHaveLength(1));
    expect(JSON.parse(server.sockets[0]!.sent[0]!)).toEqual({ type: 'auth', token: 'token-1' });
    changed.length = 0;
    server.write({
      entityType: 'user_directory',
      entityId: id(7),
      op: 'upsert',
      audience: 'all',
      payload: user(7, 'Yanet'),
      refDate: null,
    });
    await vi.waitFor(async () => expect(await store.get('user_directory', id(7))).toEqual(user(7, 'Yanet')));
    expect(changed).toEqual([{ entities: ['user_directory'], ids: [id(7)] }]);
  });

  it('si se cae el WebSocket, reintenta con espera creciente hasta 30 s y, al conectar, vuelve a empezar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Date'] });
    const server = createSyncServer();
    const { engine } = await setup(server);
    engine.start();
    await vi.waitFor(() => expect(server.sockets).toHaveLength(1));
    // Se cae y el servidor no acepta conexiones: cada intento fallido duplica la espera.
    server.refuse = true;
    server.attempts.length = 0;
    const fell = Date.now();
    server.sockets[0]!.drop(1006);
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000 + 16_000 + 30_000 + 30_000);
    const waits = server.attempts.map((t, i) => t - (i === 0 ? fell : server.attempts[i - 1]!));
    expect(waits).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]);
    expect(RECONNECT_MAX_MS).toBe(30_000);
    // Vuelve el servidor: conecta y, si se cae otra vez, la espera empieza de nuevo en 1 s.
    server.refuse = false;
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(server.sockets).toHaveLength(1));
    server.attempts.length = 0;
    const again = Date.now();
    server.sockets[0]!.drop(1006);
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.attempts.map((t) => t - again)).toEqual([1000]);
  });

  it(`sin avisos, pregunta igual cada ${POLL_MS / 1000} s`, async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    const server = createSyncServer();
    const { engine } = await setup(server);
    engine.start();
    await vi.waitFor(() => expect(engine.status().stage).toBe('ready'));
    const states = () => server.calls.filter((c) => c === '/sync/state').length;
    const before = states();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    await vi.waitFor(() => expect(states()).toBe(before + 1));
  });

  it.each([
    ['session.revoked', 'session'],
    ['device.revoked', 'device'],
  ] as const)('%s llama a onRevoked(%s) (RF-AUT-08)', async (type, kind) => {
    const server = createSyncServer();
    const onRevoked = vi.fn();
    const { engine } = await setup(server, { onRevoked });
    engine.start();
    await vi.waitFor(() => expect(server.sockets).toHaveLength(1));
    server.sockets[0]!.receive({ type });
    await vi.waitFor(() => expect(onRevoked).toHaveBeenCalledWith(kind));
  });
});

describe('reconstruir la copia (RF-CON-09)', () => {
  async function synced() {
    const server = createSyncServer();
    for (let n = 1; n <= 3; n++)
      server.write({
        entityType: 'user_directory',
        entityId: id(n),
        op: 'upsert',
        audience: 'all',
        payload: user(n),
        refDate: null,
      });
    const s = await setup(server);
    await s.engine.syncNow();
    server.calls.length = 0;
    return { server, ...s };
  }

  it('otra época (restauración): borra la copia y descarga la instantánea', async () => {
    const { server, store, engine } = await synced();
    server.current.delete(`user_directory:${id(3)}`);
    server.newEpoch('0199f0a1-0000-7000-8000-0000000000e2');
    await engine.syncNow();
    expect(await copy(store)).toEqual(server.expected());
    expect((await store.meta()).epoch).toBe('0199f0a1-0000-7000-8000-0000000000e2');
    expect(server.calls).toContain('/sync/snapshot');
  });

  it('otra versión del formato de datos (app actualizada): reconstruye', async () => {
    const { server, engine } = await synced();
    server.schemaVersion = 2;
    await engine.syncNow();
    expect(server.calls).toContain('/sync/snapshot');
  });

  it('RESYNC_REQUIRED (más de 30 días sin sincronizar): reconstruye y queda al día', async () => {
    const { server, store, engine } = await synced();
    server.write({
      entityType: 'user_directory',
      entityId: id(4),
      op: 'upsert',
      audience: 'all',
      payload: user(4),
      refDate: null,
    });
    server.write({
      entityType: 'user_directory',
      entityId: id(5),
      op: 'upsert',
      audience: 'all',
      payload: user(5),
      refDate: null,
    });
    server.purge(4);
    await engine.syncNow();
    expect(server.calls).toContain('/sync/snapshot');
    expect(await copy(store)).toEqual(server.expected());
    expect(await store.seq()).toBe(5);
  });
});

describe('sin conexión (RF-CON-05, 10)', () => {
  it('si el servidor no responde, conserva la copia y marca sin conexión; al volver, se pone al día', async () => {
    const server = createSyncServer();
    server.write({
      entityType: 'user_directory',
      entityId: id(1),
      op: 'upsert',
      audience: 'all',
      payload: user(1),
      refDate: null,
    });
    const { store, engine } = await setup(server);
    await engine.syncNow();
    server.failRate = 1;
    server.write({
      entityType: 'user_directory',
      entityId: id(2),
      op: 'upsert',
      audience: 'all',
      payload: user(2),
      refDate: null,
    });
    await engine.syncNow();
    expect(engine.status()).toMatchObject({ online: false, hasData: true, syncedAt: '2026-10-14T16:40:00.000Z' });
    expect(await store.list('user_directory')).toEqual([user(1)]);
    server.failRate = 0;
    server.serverTime = '2026-10-14T16:45:00.000Z';
    await engine.syncNow();
    expect(engine.status()).toMatchObject({ online: true, syncedAt: '2026-10-14T16:45:00.000Z' });
    expect(await copy(store)).toEqual(server.expected());
  });

  it('mide la diferencia entre la hora del dispositivo y la del servidor (RF-CON-10)', async () => {
    const server = createSyncServer();
    server.serverTime = '2026-10-14T16:34:30.000Z'; // el dispositivo marca 16:41:00: va 6,5 min adelantado
    const { engine } = await setup(server);
    await engine.syncNow();
    expect(engine.status().clockSkewMs).toBe(6.5 * 60_000);
  });

  it('waitFor espera a que la copia llegue al número de una escritura propia (plan §5.9)', async () => {
    const server = createSyncServer();
    const { store, engine } = await setup(server);
    await engine.syncNow();
    const seq = server.write({
      entityType: 'user_directory',
      entityId: id(9),
      op: 'upsert',
      audience: 'all',
      payload: user(9),
      refDate: null,
    });
    await engine.waitFor(seq);
    expect(await store.get('user_directory', id(9))).toEqual(user(9));
  });
});

describe('propiedad: convergencia (Const. XIII.6)', () => {
  it('con 1 000 operaciones al azar, épocas nuevas, depuraciones y cortes de red, la copia termina igual que el servidor', async () => {
    const op = fc.oneof(
      {
        weight: 8,
        arbitrary: fc.record({
          kind: fc.constant('write' as const),
          n: fc.integer({ min: 1, max: 40 }),
          entity: fc.constantFrom('user_directory' as const, 'user_admin' as const),
          del: fc.boolean(),
        }),
      },
      {
        weight: 3,
        arbitrary: fc.record({ kind: fc.constant('sync' as const), failRate: fc.constantFrom(0, 0, 0.3, 0.7, 1) }),
      },
      { weight: 1, arbitrary: fc.record({ kind: fc.constant('purge' as const) }) },
      { weight: 1, arbitrary: fc.record({ kind: fc.constant('epoch' as const) }) },
    );
    // Cada entidad tiene siempre la misma audiencia, como en el servidor (plan §4.4).
    const AUDIENCES = ['all', 'editors', 'apoderada', 'user:0199f0a1-0000-7000-8000-0000000000aa', 'user:otro'];
    let total = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.array(op, { minLength: 85, maxLength: 120 }),
        fc.constantFrom('apoderada', 'operador', 'lectura'),
        fc.integer(),
        async (ops, role, seed) => {
          let state = seed;
          const server = createSyncServer({ role: role as 'apoderada' | 'operador' | 'lectura', pageSize: 7 });
          server.random = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
          const { store, engine } = await setup(server);
          let epochs = 0;
          for (const o of ops) {
            total++;
            if (o.kind === 'write')
              server.write({
                entityType: o.entity,
                entityId: id(o.n),
                op: o.del ? 'delete' : 'upsert',
                audience: AUDIENCES[(o.n + (o.entity === 'user_admin' ? 1 : 0)) % AUDIENCES.length]!,
                payload: o.del ? null : { id: id(o.n), v: total },
                refDate: null,
              });
            else if (o.kind === 'sync') {
              server.failRate = o.failRate;
              await engine.syncNow();
            } else if (o.kind === 'purge') server.purge(server.lastSeq() - 2);
            else server.newEpoch(id(9000 + ++epochs));
          }
          server.failRate = 0;
          await engine.syncNow();
          expect(await copy(store)).toEqual(server.expected());
          expect(await store.seq()).toBe(server.lastSeq());
          engine.stop();
        },
      ),
      { numRuns: 12 },
    );
    expect(total).toBeGreaterThanOrEqual(1000);
  }, 120_000);
});
