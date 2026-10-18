import { ManualClock } from '@impocaribe/shared';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { createUser } from '../users/users.repo.ts';
import { CLOSE_UNAUTHORIZED } from './realtime.ts';

// T043 · plan §6.4 y RNF-04: el WebSocket avisa de los cambios confirmados (sync.available), de las sesiones y los
// dispositivos revocados, y solo atiende a una sesión vigente.
let suite: SuiteDb;
let t: TestApp;
const clock = new ManualClock('2026-10-14T12:00:00.000Z');
const tokens: Record<string, string> = {};
const open: WebSocket[] = [];

interface Probe {
  socket: WebSocket;
  messages: Record<string, unknown>[];
  closed: Promise<number>;
  /** Espera el primer mensaje que cumpla `match`. */
  next(match: (m: Record<string, unknown>) => boolean): Promise<Record<string, unknown>>;
}

function connect(token: unknown): Promise<Probe> {
  const socket = new WebSocket(`${t.base.replace('http', 'ws')}/ws`);
  open.push(socket);
  const messages: Record<string, unknown>[] = [];
  const waiting: [(m: Record<string, unknown>) => boolean, (m: Record<string, unknown>) => void][] = [];
  socket.on('message', (data) => {
    const m = JSON.parse(data.toString()) as Record<string, unknown>;
    messages.push(m);
    for (const [match, resolve] of [...waiting]) if (match(m)) resolve(m);
  });
  const closed = new Promise<number>((r) => socket.on('close', (code) => r(code)));
  const probe: Probe = {
    socket,
    messages,
    closed,
    next: (match) =>
      new Promise((resolve, reject) => {
        const found = messages.find(match);
        if (found) return resolve(found);
        waiting.push([match, resolve]);
        setTimeout(() => reject(new Error(`No llegó el mensaje esperado; llegaron ${JSON.stringify(messages)}`)), 5000);
      }),
  };
  return new Promise((resolve, reject) => {
    socket.once('open', () => {
      socket.send(JSON.stringify({ type: 'auth', token }));
      resolve(probe);
    });
    socket.once('error', reject);
  });
}

async function login(username: string, deviceId = `pc-${username}`) {
  const res = await t.fetch(`${t.base}/auth/login`, {
    method: 'POST',
    headers: appHeaders(),
    body: JSON.stringify({ username, password: 'contraseña1', deviceId, deviceLabel: 'PC', platform: 'windows' }),
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

afterEach(() => {
  for (const s of open.splice(0)) s.terminate();
});

beforeEach(async () => {
  clock.set('2026-10-14T12:00:00.000Z');
  await suite.admin.query('TRUNCATE users CASCADE; TRUNCATE idempotency_keys; TRUNCATE devices CASCADE');
  const db = drizzle(suite.app);
  for (const [username, role, nationalId] of [
    ['ana', 'apoderada', '84011905548'],
    ['oscar', 'lectura', '86030406548'],
  ] as const) {
    await db.transaction((tx) =>
      createUser(
        tx,
        clock,
        newUserSchema.parse({
          fullName: `Prueba ${username}`,
          username,
          nationalId,
          phone: '52345678',
          role,
          password: 'contraseña1',
          confirm: 'contraseña1',
        }),
      ),
    );
    tokens[username] = await login(username);
  }
}, 120_000);

describe('autenticación (plan §6.4)', () => {
  it('con un token vigente responde ready', async () => {
    const ws = await connect(tokens.oscar);
    expect(await ws.next((m) => m.type === 'ready')).toEqual({ type: 'ready' });
  });

  it.each([
    ['un token que no existe', 'no-existe'],
    ['un mensaje sin token', undefined],
  ])('%s cierra la conexión sin atenderla', async (_, token) => {
    const ws = await connect(token);
    expect(await ws.closed).toBe(CLOSE_UNAUTHORIZED);
    expect(ws.messages).toEqual([]);
  });

  it('una sesión vencida no se atiende', async () => {
    clock.set('2026-10-15T12:00:01.000Z');
    const ws = await connect(tokens.oscar);
    expect(await ws.closed).toBe(CLOSE_UNAUTHORIZED);
  });
});

describe('sync.available (RNF-04, plan §5.9)', () => {
  it('al confirmarse un cambio, todas las sesiones reciben el número hasta el que hay que sincronizar', async () => {
    const oscar = await connect(tokens.oscar);
    const ana = await connect(tokens.ana);
    await Promise.all([oscar.next((m) => m.type === 'ready'), ana.next((m) => m.type === 'ready')]);
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
    const { rows } = await suite.admin.query('SELECT last_seq::int FROM sync_state');
    for (const ws of [oscar, ana]) {
      expect(await ws.next((m) => m.type === 'sync.available' && m.seq === rows[0].last_seq)).toEqual({
        type: 'sync.available',
        seq: rows[0].last_seq,
      });
    }
  });

  it('una transacción revertida no avisa', async () => {
    const ws = await connect(tokens.oscar);
    await ws.next((m) => m.type === 'ready');
    // Una sola consulta: la transacción entera va por la misma conexión.
    await suite.admin.query('BEGIN; UPDATE sync_state SET last_seq = last_seq + 1; ROLLBACK;');
    // Una escritura posterior sí avisa: si la revertida hubiera avisado, llegaría antes.
    await suite.admin.query('UPDATE sync_state SET last_seq = last_seq + 1');
    const { rows } = await suite.admin.query('SELECT last_seq::int FROM sync_state');
    await ws.next((m) => m.type === 'sync.available');
    expect(ws.messages.filter((m) => m.type === 'sync.available')).toEqual([
      { type: 'sync.available', seq: rows[0].last_seq },
    ]);
  });

  it('RF-CON-09: una época nueva (restauración) avisa sync.epoch_changed', async () => {
    const ws = await connect(tokens.oscar);
    await ws.next((m) => m.type === 'ready');
    await suite.admin.query('UPDATE sync_state SET epoch = uuid_generate_v7()');
    expect(await ws.next((m) => m.type === 'sync.epoch_changed')).toEqual({ type: 'sync.epoch_changed' });
  });
});

describe('revocaciones (RF-AUT-08, RF-RED-05)', () => {
  it('cerrar la sesión avisa session.revoked a esa sesión y la desconecta; las demás siguen', async () => {
    const oscar = await connect(tokens.oscar);
    const ana = await connect(tokens.ana);
    await Promise.all([oscar.next((m) => m.type === 'ready'), ana.next((m) => m.type === 'ready')]);
    const res = await t.fetch(`${t.base}/auth/logout`, {
      method: 'POST',
      headers: appHeaders({ Authorization: `Bearer ${tokens.oscar}` }),
    });
    expect(res.status).toBe(204);
    expect(await oscar.next((m) => m.type === 'session.revoked')).toEqual({ type: 'session.revoked' });
    expect(await oscar.closed).toBe(1000);
    expect(ana.messages.some((m) => m.type === 'session.revoked')).toBe(false);
    expect(ana.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('revocar el dispositivo avisa device.revoked y lo desconecta', async () => {
    const oscar = await connect(tokens.oscar);
    await oscar.next((m) => m.type === 'ready');
    const res = await t.fetch(`${t.base}/devices/pc-oscar/revoke`, {
      method: 'POST',
      headers: appHeaders({ Authorization: `Bearer ${tokens.ana}` }),
    });
    expect(res.status).toBe(200);
    expect(await oscar.next((m) => m.type === 'device.revoked')).toEqual({ type: 'device.revoked' });
    expect(await oscar.closed).toBe(1000);
    // Un dispositivo revocado ya no se conecta, aunque su token no hubiera vencido.
    const again = await connect(tokens.oscar);
    expect(await again.closed).toBe(CLOSE_UNAUTHORIZED);
  });
});

describe('ruta', () => {
  it('otra ruta no admite WebSocket', async () => {
    const socket = new WebSocket(`${t.base.replace('http', 'ws')}/otra`);
    open.push(socket);
    await expect(
      new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      }),
    ).rejects.toThrow();
  });
});
