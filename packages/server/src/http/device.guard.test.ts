import { Body, Controller, Get, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ManualClock, signRequest } from '@impocaribe/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { Contract } from './contract.ts';
import { listenForTests } from '../../test/listen.ts';
import { AppModule } from '../app.module.ts';
import { configureApp } from '../app.ts';
import { ALERT_CONDITIONS_ENABLED, BACKUPS_ENABLED, CLOCK, DEVICE_GUARD_ENABLED, DEVICE_REGISTRY } from '../tokens.ts';
import type { DeviceRegistry } from './device.guard.ts';

// T015 · DT-24: salvo /health, /discovery y /pairing/*, toda petición exige X-Device-Id, X-Device-Time y la firma
// HMAC-SHA256 del dispositivo; ±5 min contra la hora del servidor corregida por el desfase medido; sin repeticiones.
// La guarda queda preparada y se activa con el emparejamiento (T035).
const SERVER_NOW = Date.parse('2026-10-14T12:00:00.000Z');
const SECRET = 'secreto-de-la-tablet-1';

@Controller('ejemplo')
class ProtectedController {
  @Get('protegido')
  @Contract({ roles: 'public' })
  get() {
    return { ok: true };
  }

  @Post('protegido')
  @Contract({ roles: 'public' })
  post(@Body() body: unknown) {
    return { recibido: body };
  }
}

// Sustituye a la tabla `devices` (T035): el módulo probado es la guarda, no el registro.
const registry: DeviceRegistry = {
  async find(deviceId) {
    if (deviceId === 'tablet-1') return { secret: SECRET, revoked: false, clockOffsetMs: 0 };
    if (deviceId === 'tablet-adelantada') return { secret: SECRET, revoked: false, clockOffsetMs: 3_600_000 };
    if (deviceId === 'tablet-revocada') return { secret: SECRET, revoked: true, clockOffsetMs: 0 };
    return null;
  },
};

let app: INestApplication;
let base: string;

async function start(enabled: boolean) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [ProtectedController] })
    .overrideProvider(CLOCK)
    .useValue(new ManualClock(new Date(SERVER_NOW).toISOString()))
    .overrideProvider(DEVICE_GUARD_ENABLED)
    .useValue(enabled)
    .overrideProvider(DEVICE_REGISTRY)
    .useValue(registry)
    // T094: sin la pasada de alertas en segundo plano (escribiría en la base mientras la prueba cierra la app).
    .overrideProvider(ALERT_CONDITIONS_ENABLED)
    .useValue(false)
    .overrideProvider(BACKUPS_ENABLED)
    .useValue(false)
    .compile();
  app = configureApp(moduleRef.createNestApplication({ logger: false, rawBody: true }));
  base = await listenForTests(app);
}

async function signed(
  method: string,
  path: string,
  opts: { device?: string; time?: number; body?: string; secret?: string } = {},
) {
  const time = String(opts.time ?? SERVER_NOW);
  const body = opts.body ?? '';
  const signature = await signRequest({ method, path, time, body }, opts.secret ?? SECRET);
  const headers: Record<string, string> = {
    'X-App-Version': '1.0.0',
    'X-Device-Id': opts.device ?? 'tablet-1',
    'X-Device-Time': time,
    'X-Device-Signature': signature,
    'Idempotency-Key': '0192a3b4-0000-7000-8000-000000000001',
  };
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(`${base}${path}`, { method, headers, ...(body ? { body } : {}) });
}

async function errorOf(res: Response) {
  return { status: res.status, ...((await res.json()) as object) };
}

afterEach(async () => {
  await app.close();
});

describe('DT-24 con la guarda activa', () => {
  it('acepta una petición firmada por un dispositivo emparejado', async () => {
    await start(true);
    const res = await signed('GET', '/api/v1/ejemplo/protegido');
    expect([res.status, await res.json()]).toEqual([200, { ok: true }]);
  });

  it('la firma cubre el cuerpo: acepta un POST firmado con su cuerpo', async () => {
    await start(true);
    const res = await signed('POST', '/api/v1/ejemplo/protegido', { body: '{"tons":"17.280"}' });
    expect([res.status, await res.json()]).toEqual([201, { recibido: { tons: '17.280' } }]);
  });

  it('rechaza un cuerpo alterado después de firmar', async () => {
    await start(true);
    const time = String(SERVER_NOW);
    const signature = await signRequest(
      { method: 'POST', path: '/api/v1/ejemplo/protegido', time, body: '{"tons":"17.280"}' },
      SECRET,
    );
    const res = await fetch(`${base}/api/v1/ejemplo/protegido`, {
      method: 'POST',
      headers: {
        'X-App-Version': '1.0.0',
        'X-Device-Id': 'tablet-1',
        'X-Device-Time': time,
        'X-Device-Signature': signature,
        'Idempotency-Key': '0192a3b4-0000-7000-8000-000000000002',
        'Content-Type': 'application/json',
      },
      body: '{"tons":"99.000"}',
    });
    expect(await errorOf(res)).toEqual({
      status: 403,
      code: 'DEVICE_NOT_PAIRED',
      message: 'La firma del dispositivo no es válida.',
    });
  });

  it('sin las cabeceras del dispositivo responde 403 DEVICE_NOT_PAIRED', async () => {
    await start(true);
    const res = await fetch(`${base}/api/v1/ejemplo/protegido`, { headers: { 'X-App-Version': '1.0.0' } });
    expect(await errorOf(res)).toEqual({
      status: 403,
      code: 'DEVICE_NOT_PAIRED',
      message: 'Este dispositivo no está emparejado con el servidor. Emparéjelo desde la pantalla de conexión.',
    });
  });

  it('un dispositivo desconocido responde 403 DEVICE_NOT_PAIRED', async () => {
    await start(true);
    const res = await signed('GET', '/api/v1/ejemplo/protegido', { device: 'intruso' });
    expect(await errorOf(res)).toEqual({
      status: 403,
      code: 'DEVICE_NOT_PAIRED',
      message: 'Este dispositivo no está emparejado con el servidor. Emparéjelo desde la pantalla de conexión.',
    });
  });

  it('un dispositivo revocado responde 403 DEVICE_REVOKED', async () => {
    await start(true);
    const res = await signed('GET', '/api/v1/ejemplo/protegido', { device: 'tablet-revocada' });
    expect(await errorOf(res)).toEqual({
      status: 403,
      code: 'DEVICE_REVOKED',
      message: 'Este dispositivo fue revocado. Para volver a usarlo, emparéjelo de nuevo.',
    });
  });

  it('una firma con otro secreto se rechaza', async () => {
    await start(true);
    const res = await signed('GET', '/api/v1/ejemplo/protegido', { secret: 'otro-secreto' });
    expect(await errorOf(res)).toEqual({
      status: 403,
      code: 'DEVICE_NOT_PAIRED',
      message: 'La firma del dispositivo no es válida.',
    });
  });

  it.each([
    ['5 min exactos por delante', SERVER_NOW + 300_000, 200],
    ['5 min exactos por detrás', SERVER_NOW - 300_000, 200],
    ['5 min y 1 ms por delante', SERVER_NOW + 300_001, 403],
    ['5 min y 1 ms por detrás', SERVER_NOW - 300_001, 403],
  ])('ventana de ±5 min: %s → %d', async (_name, time, status) => {
    await start(true);
    const res = await signed('GET', '/api/v1/ejemplo/protegido', { time });
    expect(res.status).toBe(status);
  });

  it('fuera de la ventana explica que la hora no coincide', async () => {
    await start(true);
    const res = await signed('GET', '/api/v1/ejemplo/protegido', { time: SERVER_NOW + 300_001 });
    expect(await errorOf(res)).toEqual({
      status: 403,
      code: 'DEVICE_NOT_PAIRED',
      message: 'La hora del dispositivo difiere más de 5 minutos de la del servidor. Ajústela y vuelva a intentarlo.',
    });
  });

  it('corrige por el desfase medido: un dispositivo 1 h adelantado con desfase registrado se acepta', async () => {
    await start(true);
    const res = await signed('GET', '/api/v1/ejemplo/protegido', {
      device: 'tablet-adelantada',
      time: SERVER_NOW + 3_600_000,
    });
    expect(res.status).toBe(200);
  });

  it('rechaza repetir la misma firma dentro de la ventana', async () => {
    await start(true);
    const time = SERVER_NOW + 1_000;
    expect((await signed('GET', '/api/v1/ejemplo/protegido', { time })).status).toBe(200);
    const replay = await signed('GET', '/api/v1/ejemplo/protegido', { time });
    expect(await errorOf(replay)).toEqual({
      status: 403,
      code: 'DEVICE_NOT_PAIRED',
      message: 'Esta petición ya se recibió antes: no se procesa dos veces.',
    });
  });

  it.each(['/api/v1/health', '/api/v1/discovery', '/api/v1/pairing/requests'])(
    '%s no exige dispositivo',
    async (path) => {
      await start(true);
      const res = await fetch(`${base}${path}`);
      expect(res.status).not.toBe(403);
    },
  );
});

describe('DT-24 antes del emparejamiento (guarda inactiva hasta T035)', () => {
  it('sin cabeceras del dispositivo la petición pasa', async () => {
    await start(false);
    const res = await fetch(`${base}/api/v1/ejemplo/protegido`, { headers: { 'X-App-Version': '1.0.0' } });
    expect([res.status, await res.json()]).toEqual([200, { ok: true }]);
  });
});
