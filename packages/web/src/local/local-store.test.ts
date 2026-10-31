import { describe, expect, it } from 'vitest';
import { createTestPlatform } from '../platform/test-platform';
import { LOCAL_SCHEMA_VERSION, LocalStore } from './local-store';

// T044 · DT-03 y plan §7.1 (repositorio local): una tabla por entidad replicada y sync_meta, con migraciones propias.
// Solo la sincronización escribe aquí; las pantallas leen (Const. art. VII.2).
const open = async () => LocalStore.open(await createTestPlatform());
const user = (id: string, fullName: string) => ({ id, fullName, role: 'operador', active: true });
const A = '0199f0a1-0000-7000-8000-00000000000a';
const B = '0199f0a1-0000-7000-8000-00000000000b';

describe('esquema', () => {
  it('se crea con su versión y una tabla por entidad replicada', async () => {
    const store = await open();
    const [row] = await store.db.query<{ user_version: number }>('PRAGMA user_version');
    expect(row!.user_version).toBe(LOCAL_SCHEMA_VERSION);
    const tables = (
      await store.db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    ).map((t) => t.name);
    expect(tables).toEqual([
      'alert',
      'carrier',
      'client',
      'declaration',
      'draft',
      'driver',
      'local_drafts',
      'order',
      'sync_meta',
      'trailer',
      'truck',
      'user_admin',
      'user_directory',
      'vessel',
    ]);
  });

  it('volver a abrirla no repite las migraciones', async () => {
    const platform = await createTestPlatform();
    const db = await platform.openDatabase('impocaribe');
    await LocalStore.migrate(db);
    await LocalStore.migrate(db);
    const [row] = await db.query<{ user_version: number }>('PRAGMA user_version');
    expect(row!.user_version).toBe(LOCAL_SCHEMA_VERSION);
  });
});

describe('aplicar cambios (plan §5.9)', () => {
  it('upsert guarda el DTO tal como llegó; delete lo quita; el último número queda en sync_meta', async () => {
    const store = await open();
    await store.apply(
      [
        { seq: 1, entityType: 'user_directory', entityId: A, op: 'upsert', payload: user(A, 'Ana'), refDate: null },
        { seq: 2, entityType: 'user_directory', entityId: B, op: 'upsert', payload: user(B, 'Beto'), refDate: null },
        {
          seq: 3,
          entityType: 'user_directory',
          entityId: A,
          op: 'upsert',
          payload: user(A, 'Ana María'),
          refDate: null,
        },
        { seq: 4, entityType: 'user_directory', entityId: B, op: 'delete', payload: null, refDate: null },
      ],
      4,
    );
    expect(await store.list('user_directory')).toEqual([user(A, 'Ana María')]);
    expect(await store.get('user_directory', A)).toEqual(user(A, 'Ana María'));
    expect(await store.get('user_directory', B)).toBeNull();
    expect(await store.seq()).toBe(4);
  });

  it('todo o nada: si un cambio falla, la copia y el número quedan como estaban', async () => {
    const store = await open();
    await store.apply(
      [{ seq: 1, entityType: 'user_directory', entityId: A, op: 'upsert', payload: user(A, 'Ana'), refDate: null }],
      1,
    );
    await expect(
      store.apply(
        [
          { seq: 2, entityType: 'user_directory', entityId: B, op: 'upsert', payload: user(B, 'Beto'), refDate: null },
          { seq: 3, entityType: 'no_existe' as never, entityId: B, op: 'upsert', payload: {}, refDate: null },
        ],
        3,
      ),
    ).rejects.toThrow();
    expect(await store.list('user_directory')).toEqual([user(A, 'Ana')]);
    expect(await store.seq()).toBe(1);
  });

  it('RNF-20: muchas altas van en pocas sentencias, respetando el orden, los repetidos y las bajas', async () => {
    const platform = await createTestPlatform();
    const open = platform.openDatabase;
    let statements = 0;
    platform.openDatabase = async (name) => {
      const db = await open(name);
      return {
        ...db,
        transaction: (fn) =>
          db.transaction((tx) => fn({ ...tx, execute: (sql, p) => (statements++, tx.execute(sql, p)) })),
      };
    };
    const store = await LocalStore.open(platform);
    const id = (n: number) => `0199f0a1-0000-7000-8000-${String(n).padStart(12, '0')}`;
    const changes = Array.from({ length: 400 }, (_, i) => ({
      seq: i + 1,
      entityType: i % 2 ? ('user_directory' as const) : ('user_admin' as const),
      entityId: id(Math.floor(i / 2)),
      op: 'upsert' as const,
      payload: user(id(Math.floor(i / 2)), `Usuario ${i}`),
      refDate: null,
    }));
    // La misma fila otra vez, después una baja y una alta de la que se borró.
    const more = [
      {
        seq: 401,
        entityType: 'user_directory' as const,
        entityId: id(7),
        op: 'upsert' as const,
        payload: user(id(7), 'Otra vez'),
        refDate: null,
      },
      {
        seq: 402,
        entityType: 'user_directory' as const,
        entityId: id(8),
        op: 'delete' as const,
        payload: null,
        refDate: null,
      },
      {
        seq: 403,
        entityType: 'user_directory' as const,
        entityId: id(9),
        op: 'upsert' as const,
        payload: user(id(9), 'Último'),
        refDate: null,
      },
    ];
    statements = 0;
    await store.apply(
      [
        ...changes.filter((c) => c.entityType === 'user_directory'),
        ...changes.filter((c) => c.entityType === 'user_admin'),
        ...more,
      ],
      403,
    );
    // 200 de cada tabla en un lote cada una, la repetida, la baja, la última y el número: 6 sentencias, no 404.
    expect(statements).toBe(6);
    expect((await store.list('user_directory')).length).toBe(199);
    expect(await store.get('user_directory', id(7))).toEqual(user(id(7), 'Otra vez'));
    expect(await store.get('user_directory', id(8))).toBeNull();
    expect(await store.get('user_directory', id(9))).toEqual(user(id(9), 'Último'));
    expect((await store.list('user_admin')).length).toBe(200);
    expect(await store.seq()).toBe(403);
  });

  it('nextSince mayor que el último cambio visible también avanza el número', async () => {
    const store = await open();
    await store.apply([], 9);
    expect(await store.seq()).toBe(9);
  });
});

describe('meta, borrado y ventana de 12 meses', () => {
  it('guarda la época, la versión del formato y la última sincronización', async () => {
    const store = await open();
    expect(await store.meta()).toEqual({ seq: null, epoch: null, schemaVersion: null, syncedAt: null, skewMs: null });
    await store.setMeta({
      epoch: '0199f0a1-0000-7000-8000-0000000000ee',
      schemaVersion: 1,
      syncedAt: '2026-10-14T16:40:00.000Z',
      skewMs: null,
    });
    expect(await store.meta()).toEqual({
      seq: null,
      epoch: '0199f0a1-0000-7000-8000-0000000000ee',
      schemaVersion: 1,
      syncedAt: '2026-10-14T16:40:00.000Z',
      skewMs: null,
    });
  });

  it('clear borra la copia y su meta (RF-AUT-08, RF-CON-09)', async () => {
    const store = await open();
    await store.apply(
      [{ seq: 1, entityType: 'user_admin', entityId: A, op: 'upsert', payload: { id: A }, refDate: null }],
      1,
    );
    await store.setMeta({ epoch: '0199f0a1-0000-7000-8000-0000000000ee', schemaVersion: 1, syncedAt: 'x' });
    await store.clear();
    expect([await store.list('user_admin'), await store.meta()]).toEqual([
      [],
      { seq: null, epoch: null, schemaVersion: null, syncedAt: null, skewMs: null },
    ]);
  });

  it('prune quita lo que tiene fecha de referencia anterior al corte y conserva lo que no la tiene', async () => {
    const store = await open();
    await store.apply(
      [
        {
          seq: 1,
          entityType: 'user_directory',
          entityId: A,
          op: 'upsert',
          payload: user(A, 'Ana'),
          refDate: '2025-10-13',
        },
        {
          seq: 2,
          entityType: 'user_directory',
          entityId: B,
          op: 'upsert',
          payload: user(B, 'Beto'),
          refDate: '2025-10-14',
        },
        {
          seq: 3,
          entityType: 'user_admin',
          entityId: A,
          op: 'upsert',
          payload: { id: A },
          refDate: null,
        },
      ],
      3,
    );
    await store.prune('2025-10-14');
    expect(await store.list('user_directory')).toEqual([user(B, 'Beto')]);
    expect(await store.list('user_admin')).toEqual([{ id: A }]);
  });
});

describe('RF-ORD-06: borradores de este dispositivo', () => {
  it('se guardan, se reemplazan, se listan del más reciente al más antiguo y sobreviven al borrado de la copia', async () => {
    const store = await open();
    await store.saveLocalDraft('a', { tons: '17,28' }, '2026-08-29T10:00:00.000Z');
    await store.saveLocalDraft('b', { tons: '5' }, '2026-08-29T11:00:00.000Z');
    await store.saveLocalDraft('a', { tons: '18' }, '2026-08-29T12:00:00.000Z');
    await store.clear();
    expect(await store.localDrafts()).toEqual([
      { id: 'a', payload: { tons: '18' }, updatedAt: '2026-08-29T12:00:00.000Z' },
      { id: 'b', payload: { tons: '5' }, updatedAt: '2026-08-29T11:00:00.000Z' },
    ]);
    await store.deleteLocalDraft('a');
    expect((await store.localDrafts()).map((d) => d.id)).toEqual(['b']);
  });
});
