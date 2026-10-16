import { ManualClock, pairingCode, signRequest } from '@impocaribe/shared';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appHeaders, createTestApp, type TestApp } from '../../test/app.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { ServerEvents } from '../events/server-events.ts';
import { createUser } from '../users/users.repo.ts';

// T035 · RF-RED-04 y 05, DT-24, plan §6.2 (Descubrimiento y emparejamiento, Administración local) y §9.
let suite: SuiteDb;
let t: TestApp;
const clock = new ManualClock('2026-10-15T12:00:00.000Z');
const CA = 'AA:BB'; // la huella de la identidad de pruebas (test/app.ts)

const local = (path: string, init: RequestInit = {}) =>
  fetch(`${t.base}/local${path}`, { ...init, headers: appHeaders() });
async function request(clientNonce = 'nonce-del-telefono', deviceName = 'Teléfono de patio') {
  const res = await fetch(`${t.base}/pairing/requests`, {
    method: 'POST',
    headers: appHeaders(),
    body: JSON.stringify({ deviceName, platform: 'android', clientNonce }),
  });
  return {
    status: res.status,
    json: (await res.json()) as { requestId: string; serverNonce: string; expiresAt: string },
  };
}
const poll = (id: string, clientNonce = 'nonce-del-telefono') =>
  fetch(`${t.base}/pairing/requests/${id}?clientNonce=${encodeURIComponent(clientNonce)}`, { headers: appHeaders() });

/** Petición firmada con el secreto que entregó el emparejamiento, como lo haría la app. */
async function asDevice(deviceId: string, secret: string, path: string, init: RequestInit = {}) {
  const time = String(clock.now().getTime());
  const u = new URL(`${t.base}${path}`);
  const body = typeof init.body === 'string' ? init.body : '';
  const signature = await signRequest(
    { method: init.method ?? 'GET', path: u.pathname + u.search, time, body },
    secret,
  );
  return fetch(u, {
    ...init,
    headers: {
      ...appHeaders(),
      ...(init.headers as Record<string, string> | undefined),
      'X-Device-Id': deviceId,
      'X-Device-Time': time,
      'X-Device-Signature': signature,
    },
  });
}

async function pairByCode(nonce = 'nonce-del-telefono') {
  const { json } = await request(nonce);
  await local(`/pairing/${json.requestId}/confirm`, { method: 'POST' });
  return (await (await poll(json.requestId, nonce)).json()) as { deviceId: string; deviceSecret: string };
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
  clock.set('2026-10-15T12:00:00.000Z');
  await suite.admin.query(
    `TRUNCATE users, devices, pairing_requests, pairing_qr_tokens CASCADE;
     ALTER TABLE audit_log DISABLE TRIGGER USER; TRUNCATE audit_log; ALTER TABLE audit_log ENABLE TRIGGER USER;`,
  );
});

describe('emparejamiento por código (RF-RED-04)', () => {
  it('la solicitud devuelve el nonce del servidor y caduca a los 5 minutos', async () => {
    const { status, json } = await request();
    expect([status, json.serverNonce, json.expiresAt]).toEqual([201, json.serverNonce, '2026-10-15T12:05:00.000Z']);
    expect(json.serverNonce).toMatch(/^[A-Za-z0-9_-]{22,}$/);
  });

  it('la pantalla del servidor muestra el mismo código que calcula la app', async () => {
    const { json } = await request();
    const pending = (await (await local('/pairing')).json()) as Record<string, unknown>[];
    expect(pending).toEqual([
      {
        id: json.requestId,
        deviceName: 'Teléfono de patio',
        platform: 'android',
        code: await pairingCode(CA, 'nonce-del-telefono', json.serverNonce),
        expiresAt: '2026-10-15T12:05:00.000Z',
      },
    ]);
  });

  it('confirmado en el servidor, la app recibe su identificador y su secreto', async () => {
    const { json } = await request();
    const pending = await poll(json.requestId);
    expect(await pending.json()).toEqual({ status: 'pending' });
    expect((await local(`/pairing/${json.requestId}/confirm`, { method: 'POST' })).status).toBe(200);
    const confirmed = (await (await poll(json.requestId)).json()) as Record<string, string>;
    expect(confirmed).toEqual({
      status: 'confirmed',
      deviceId: confirmed.deviceId,
      deviceSecret: confirmed.deviceSecret,
    });
    expect(confirmed.deviceSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { rows } = await suite.admin.query('SELECT name, platform, paired_method FROM devices WHERE id = $1', [
      confirmed.deviceId,
    ]);
    expect(rows).toEqual([{ name: 'Teléfono de patio', platform: 'android', paired_method: 'code' }]);
  });

  it('sin el nonce de la app nadie más recoge el secreto', async () => {
    const { json } = await request();
    await local(`/pairing/${json.requestId}/confirm`, { method: 'POST' });
    expect((await poll(json.requestId, 'otro-nonce')).status).toBe(404);
  });

  it('rechazada en el servidor, la app recibe PAIRING_REJECTED', async () => {
    const { json } = await request();
    await local(`/pairing/${json.requestId}/reject`, { method: 'POST' });
    const res = await poll(json.requestId);
    expect([res.status, ((await res.json()) as { code: string }).code]).toEqual([403, 'PAIRING_REJECTED']);
  });

  it('un código caducado no se puede confirmar: a los 4:59 sí, a los 5:00 no', async () => {
    const a = await request('nonce-a');
    const b = await request('nonce-b');
    clock.set('2026-10-15T12:04:59.000Z');
    expect((await local(`/pairing/${a.json.requestId}/confirm`, { method: 'POST' })).status).toBe(200);
    clock.set('2026-10-15T12:05:00.000Z');
    const late = await local(`/pairing/${b.json.requestId}/confirm`, { method: 'POST' });
    expect([late.status, await late.json()]).toEqual([
      410,
      {
        code: 'PAIRING_EXPIRED',
        message: 'La solicitud de emparejamiento caducó. Vuelva a empezar desde el dispositivo.',
      },
    ]);
    expect((await poll(b.json.requestId, 'nonce-b')).status).toBe(410);
  });

  it('una solicitud caducada ya no aparece en la pantalla del servidor', async () => {
    await request();
    clock.set('2026-10-15T12:05:00.000Z');
    expect(await (await local('/pairing')).json()).toEqual([]);
  });
});

describe('emparejamiento por QR', () => {
  it('el QR empareja sin código, y no sirve dos veces', async () => {
    const qr = (await (await local('/qr', { method: 'POST' })).json()) as Record<string, string>;
    expect(qr).toEqual({
      qrToken: qr.qrToken,
      serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
      caFingerprint: CA,
      expiresAt: '2026-10-15T12:05:00.000Z',
    });
    const pair = () =>
      fetch(`${t.base}/pairing/qr`, {
        method: 'POST',
        headers: appHeaders(),
        body: JSON.stringify({ qrToken: qr.qrToken, deviceName: 'Tablet almacén', platform: 'android' }),
      });
    const first = await pair();
    const json = (await first.json()) as { deviceId: string; deviceSecret: string };
    expect([first.status, json.deviceSecret.length]).toEqual([201, 43]);
    const second = await pair();
    expect([second.status, ((await second.json()) as { code: string }).code]).toEqual([410, 'PAIRING_EXPIRED']);
  });

  it('un QR de hace 5 minutos ya no sirve', async () => {
    const qr = (await (await local('/qr', { method: 'POST' })).json()) as { qrToken: string };
    clock.set('2026-10-15T12:05:00.000Z');
    const res = await fetch(`${t.base}/pairing/qr`, {
      method: 'POST',
      headers: appHeaders(),
      body: JSON.stringify({ qrToken: qr.qrToken, deviceName: 'Tablet', platform: 'android' }),
    });
    expect(res.status).toBe(410);
  });
});

describe('/local/* solo desde la propia PC servidor', () => {
  it.each([
    ['GET', '/pairing'],
    ['POST', '/qr'],
    ['POST', '/pair-self'],
  ])('%s /local%s desde otra IP responde 403', async (method, path) => {
    expect(t.lanBase).not.toBeNull();
    const res = await fetch(`${t.lanBase}/local${path}`, {
      method,
      headers: appHeaders(),
      body: method === 'GET' ? null : '{}',
    });
    expect([res.status, await res.json()]).toEqual([
      403,
      { code: 'FORBIDDEN', message: 'Solo se puede hacer desde la propia PC servidor.' },
    ]);
  });

  it('la app de la PC servidor se empareja sola', async () => {
    const res = await local('/pair-self', {
      method: 'POST',
      body: JSON.stringify({ deviceName: 'PC SERVIDOR', platform: 'windows' }),
    });
    const json = (await res.json()) as { deviceId: string; deviceSecret: string };
    expect(res.status).toBe(201);
    expect((await asDevice(json.deviceId, json.deviceSecret, '/setup/status')).status).toBe(200);
    const { rows } = await suite.admin.query('SELECT paired_method FROM devices WHERE id = $1', [json.deviceId]);
    expect(rows).toEqual([{ paired_method: 'local' }]);
  });
});

describe('DT-24: todo, salvo descubrir y emparejarse, exige un dispositivo emparejado', () => {
  it('sin dispositivo, el login, la recuperación y el primer arranque se rechazan', async () => {
    const results = await Promise.all(
      ['/auth/login', '/auth/recover', '/setup'].map((p) =>
        fetch(`${t.base}${p}`, { method: 'POST', headers: appHeaders(), body: '{}' }).then(async (r) => [
          r.status,
          ((await r.json()) as { code: string }).code,
        ]),
      ),
    );
    expect(results).toEqual(Array(3).fill([403, 'DEVICE_NOT_PAIRED']));
  });

  it('health y discovery siguen abiertos', async () => {
    const [h, d] = await Promise.all([fetch(`${t.base}/health`), fetch(`${t.base}/discovery`)]);
    expect([h.status, d.status]).toEqual([200, 200]);
  });

  it('con el secreto del emparejamiento, el dispositivo entra', async () => {
    const device = await pairByCode();
    expect((await asDevice(device.deviceId, device.deviceSecret, '/setup/status')).status).toBe(200);
  });

  it('una sesión solo vale desde el dispositivo que la abrió (plan §9)', async () => {
    await drizzle(suite.app).transaction((tx) =>
      createUser(
        tx,
        clock,
        newUserSchema.parse({
          fullName: 'Mario Delgado',
          username: 'mario.delgado',
          nationalId: '84011905548',
          phone: '52345678',
          role: 'operador',
          password: 'contraseña1',
          confirm: 'contraseña1',
        }),
      ),
    );
    const phone = await pairByCode('nonce-tel');
    const tablet = await pairByCode('nonce-tab');
    const login = await asDevice(phone.deviceId, phone.deviceSecret, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'mario.delgado',
        password: 'contraseña1',
        deviceId: phone.deviceId,
        deviceLabel: 'Tel',
        platform: 'android',
      }),
    });
    const { token } = (await login.json()) as { token: string };
    const fromPhone = await asDevice(phone.deviceId, phone.deviceSecret, '/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(fromPhone.status).toBe(200);
    const stolen = await asDevice(tablet.deviceId, tablet.deviceSecret, '/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(stolen.status).toBe(401);
  });
});

describe('RF-RED-05: dispositivos emparejados y revocación', () => {
  async function apoderada() {
    await drizzle(suite.app).transaction((tx) =>
      createUser(
        tx,
        clock,
        newUserSchema.parse({
          fullName: 'Ana Apoderada',
          username: 'ana',
          nationalId: '84011905548',
          phone: '52345678',
          role: 'apoderada',
          password: 'contraseña1',
          confirm: 'contraseña1',
        }),
      ),
    );
    const res = await t.fetch(`${t.base}/auth/login`, {
      method: 'POST',
      headers: appHeaders(),
      body: JSON.stringify({
        username: 'ana',
        password: 'contraseña1',
        deviceId: 'pc-oficina',
        deviceLabel: 'PC',
        platform: 'windows',
      }),
    });
    return ((await res.json()) as { token: string }).token;
  }

  it('la Apoderada ve los dispositivos con su nombre, plataforma y fechas', async () => {
    const token = await apoderada();
    const device = await pairByCode();
    const list = (await (
      await t.fetch(`${t.base}/devices`, { headers: appHeaders({ Authorization: `Bearer ${token}` }) })
    ).json()) as Record<string, unknown>[];
    expect(list.find((d) => d.id === device.deviceId)).toEqual({
      id: device.deviceId,
      name: 'Teléfono de patio',
      platform: 'android',
      pairedAt: '2026-10-15T12:00:00.000Z',
      pairedMethod: 'code',
      lastSeenAt: null,
      revokedAt: null,
    });
  });

  it('un dispositivo revocado recibe DEVICE_REVOKED, pierde sus sesiones y se avisa con device.revoked', async () => {
    const token = await apoderada();
    const device = await pairByCode();
    const events: unknown[] = [];
    t.app.get(ServerEvents).on('device.revoked', (e) => events.push(e));
    const res = await t.fetch(`${t.base}/devices/${device.deviceId}/revoke`, {
      method: 'POST',
      headers: appHeaders({ Authorization: `Bearer ${token}` }),
    });
    expect(res.status).toBe(200);
    const after = await asDevice(device.deviceId, device.deviceSecret, '/setup/status');
    expect([after.status, ((await after.json()) as { code: string }).code]).toEqual([403, 'DEVICE_REVOKED']);
    expect(events).toEqual([{ deviceId: device.deviceId }]);
    const audit = await suite.admin.query("SELECT entity_id, ok FROM audit_log WHERE action = 'device.revoke'");
    expect(audit.rows).toEqual([{ entity_id: device.deviceId, ok: true }]);
  });

  it('solo una Apoderada revoca', async () => {
    await apoderada();
    await drizzle(suite.app).transaction((tx) =>
      createUser(
        tx,
        clock,
        newUserSchema.parse({
          fullName: 'Mario Operador',
          username: 'mario',
          nationalId: '85020306548',
          phone: '52345678',
          role: 'operador',
          password: 'contraseña1',
          confirm: 'contraseña1',
        }),
      ),
    );
    const login = await t.fetch(`${t.base}/auth/login`, {
      method: 'POST',
      headers: appHeaders(),
      body: JSON.stringify({
        username: 'mario',
        password: 'contraseña1',
        deviceId: 'pc-2',
        deviceLabel: 'PC 2',
        platform: 'windows',
      }),
    });
    const { token } = (await login.json()) as { token: string };
    const device = await pairByCode();
    const res = await t.fetch(`${t.base}/devices/${device.deviceId}/revoke`, {
      method: 'POST',
      headers: appHeaders({ Authorization: `Bearer ${token}` }),
    });
    expect(res.status).toBe(403);
  });
});
