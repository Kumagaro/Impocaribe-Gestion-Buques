import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, apiRegistry, createApiClient, defineEndpoint, type Transport } from './client';

// T020 · DT-05 (Bearer), DT-11 (X-App-Version, 426), DT-22 (Idempotency-Key), plan §6 (formato de error, 410) y
// RF-CON-10 (X-Device-Time). El transporte es una dependencia: aquí se sustituye para ver lo que el cliente envía.
const DEVICE_NOW = new Date('2026-10-14T12:00:00.000Z');
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const getDeclaration = defineEndpoint({
  method: 'GET',
  path: '/declarations/:id',
  output: z.object({ number: z.string(), balance: z.string() }),
});
const issueOrder = defineEndpoint({
  method: 'POST',
  path: '/orders',
  input: z.object({ tons: z.string() }),
  output: z.object({ number: z.string() }),
});

function respond(status: number, body: unknown, contentType = 'application/json') {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, { status, headers: { 'Content-Type': contentType } });
}

function setup(response: Response | Error = respond(200, { number: '00431', balance: '593.050' })) {
  const requests: { url: string; init: RequestInit }[] = [];
  const transport: Transport = async (url, init) => {
    requests.push({ url, init });
    if (response instanceof Error) throw response;
    return response;
  };
  const handlers = { onSessionExpired: vi.fn(), onUpgradeRequired: vi.fn(), onResyncRequired: vi.fn() };
  const client = createApiClient({
    baseUrl: 'https://servidor:8443/api/v1',
    appVersion: '1.2.0',
    getToken: async () => 'token-de-sesion',
    now: () => DEVICE_NOW,
    transport,
    ...handlers,
  });
  return { client, requests, handlers };
}

const headers = (init: RequestInit) => Object.fromEntries(new Headers(init.headers).entries());

describe('cabeceras de cada petición', () => {
  it('una consulta lleva Bearer, versión de la app y hora del dispositivo, sin Idempotency-Key', async () => {
    const { client, requests } = setup();
    await client.request(getDeclaration, { params: { id: '0192a3b4' } });
    expect(requests[0]!.url).toBe('https://servidor:8443/api/v1/declarations/0192a3b4');
    expect(requests[0]!.init.method).toBe('GET');
    expect(headers(requests[0]!.init)).toEqual({
      authorization: 'Bearer token-de-sesion',
      'x-app-version': '1.2.0',
      'x-device-time': String(DEVICE_NOW.getTime()),
    });
  });

  it('una escritura envía el cuerpo JSON y una Idempotency-Key nueva (UUID)', async () => {
    const { client, requests } = setup(respond(201, { number: 'EAGLE1-2026-V1-0001' }));
    await client.request(issueOrder, { body: { tons: '17.280' } });
    const h = headers(requests[0]!.init);
    expect(requests[0]!.init.body).toBe('{"tons":"17.280"}');
    expect(h['content-type']).toBe('application/json');
    expect(h['idempotency-key']).toMatch(UUID_V4);
  });

  it('un reintento del mismo intento del usuario reutiliza su clave', async () => {
    const { client, requests } = setup(respond(201, { number: 'EAGLE1-2026-V1-0001' }));
    await client.request(issueOrder, {
      body: { tons: '17.280' },
      idempotencyKey: '0192a3b4-0000-7000-8000-000000000001',
    });
    expect(headers(requests[0]!.init)['idempotency-key']).toBe('0192a3b4-0000-7000-8000-000000000001');
  });

  it('sin sesión no envía Authorization', async () => {
    const { requests } = setup();
    const client = createApiClient({
      baseUrl: 'https://servidor:8443/api/v1',
      appVersion: '1.2.0',
      getToken: async () => null,
      now: () => DEVICE_NOW,
      transport: async (url, init) => (requests.push({ url, init }), respond(200, { number: '1', balance: '0.000' })),
    });
    await client.request(getDeclaration, { params: { id: 'x' } });
    expect(headers(requests[0]!.init).authorization).toBeUndefined();
  });

  it('añade los parámetros de consulta', async () => {
    const list = defineEndpoint({ method: 'GET', path: '/orders' });
    const { client, requests } = setup(respond(200, []));
    await client.request(list, { query: { status: 'official', vessel: 'EAGLE 1' } });
    expect(requests[0]!.url).toBe('https://servidor:8443/api/v1/orders?status=official&vessel=EAGLE+1');
  });
});

describe('respuestas correctas', () => {
  it('devuelve el cuerpo validado con el esquema compartido', async () => {
    const { client } = setup();
    await expect(client.request(getDeclaration, { params: { id: 'x' } })).resolves.toEqual({
      number: '00431',
      balance: '593.050',
    });
  });

  it('una respuesta que no cumple el esquema es un error, no un dato a medias', async () => {
    const { client } = setup(respond(200, { number: '00431' }));
    await expect(client.request(getDeclaration, { params: { id: 'x' } })).rejects.toEqual(
      new ApiError(
        500,
        'INTERNAL_ERROR',
        'La respuesta del servidor no tiene el formato esperado. Actualice la app o avise al responsable.',
      ),
    );
  });
});

describe('plan §6.1: errores de negocio', () => {
  it('convierte el cuerpo de error en ApiError con estado, código, mensaje y detalles', async () => {
    const body = {
      code: 'OVERDRAFT_ALLOCATION',
      message: 'Sobregiro: la orden supera el saldo por 7,280 t. Quedan 10,000 t en el DM 00431 (buque EAGLE1).',
      details: { requested: '17.280', balance: '10.000', excess: '7.280' },
    };
    const { client } = setup(respond(422, body));
    await expect(client.request(issueOrder, { body: { tons: '17.280' } })).rejects.toEqual(
      new ApiError(422, 'OVERDRAFT_ALLOCATION', body.message, body.details),
    );
  });

  it('un error sin cuerpo JSON (por ejemplo, una página HTML) es un error interno con mensaje en español', async () => {
    const { client } = setup(respond(502, '<html>Bad Gateway</html>', 'text/html'));
    await expect(client.request(getDeclaration, { params: { id: 'x' } })).rejects.toEqual(
      new ApiError(502, 'INTERNAL_ERROR', 'El servidor respondió con un error inesperado. Inténtelo de nuevo.'),
    );
  });

  it('sin conexión con el servidor lanza OFFLINE', async () => {
    const { client } = setup(new TypeError('fetch failed'));
    await expect(client.request(getDeclaration, { params: { id: 'x' } })).rejects.toEqual(
      new ApiError(0, 'OFFLINE', 'No hay conexión con el servidor. Inténtelo cuando vuelva la conexión.'),
    );
  });
});

describe('respuestas que cambian el estado de la app', () => {
  it('401 SESSION_EXPIRED avisa de que la sesión terminó', async () => {
    const { client, handlers } = setup(respond(401, { code: 'SESSION_EXPIRED', message: 'La sesión venció.' }));
    await expect(client.request(getDeclaration, { params: { id: 'x' } })).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    expect(handlers.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('426 UPGRADE_REQUIRED avisa con la versión mínima (EST-07)', async () => {
    const details = { appVersion: '1.2.0', minVersion: '1.3.0' };
    const { client, handlers } = setup(
      respond(426, { code: 'UPGRADE_REQUIRED', message: 'Actualice la app.', details }),
    );
    await expect(client.request(getDeclaration, { params: { id: 'x' } })).rejects.toMatchObject({
      code: 'UPGRADE_REQUIRED',
    });
    expect(handlers.onUpgradeRequired).toHaveBeenCalledWith(details);
  });

  it('410 RESYNC_REQUIRED avisa de que la copia local debe reconstruirse', async () => {
    const { client, handlers } = setup(respond(410, { code: 'RESYNC_REQUIRED', message: 'Reconstruya la copia.' }));
    await expect(client.request(getDeclaration, { params: { id: 'x' } })).rejects.toMatchObject({
      code: 'RESYNC_REQUIRED',
    });
    expect(handlers.onResyncRequired).toHaveBeenCalledTimes(1);
  });

  it('un error de negocio corriente no dispara ninguno de esos avisos', async () => {
    const { client, handlers } = setup(respond(422, { code: 'DECLARATION_EXPIRED', message: 'La DM venció.' }));
    await expect(client.request(getDeclaration, { params: { id: 'x' } })).rejects.toMatchObject({
      code: 'DECLARATION_EXPIRED',
    });
    expect(
      [handlers.onSessionExpired, handlers.onUpgradeRequired, handlers.onResyncRequired].map(
        (h) => h.mock.calls.length,
      ),
    ).toEqual([0, 0, 0]);
  });
});

describe('registro de llamadas para la prueba de contrato (T026)', () => {
  it('cada endpoint declarado queda registrado con su método, ruta y esquemas', () => {
    expect(apiRegistry.filter((e) => e.path === '/orders' && e.method === 'POST')).toEqual([issueOrder]);
  });

  it('declarar dos veces el mismo método y ruta es un error de programación', () => {
    expect(() => defineEndpoint({ method: 'POST', path: '/orders' })).toThrow(
      'El endpoint POST /orders ya está declarado: use la declaración existente.',
    );
  });
});
