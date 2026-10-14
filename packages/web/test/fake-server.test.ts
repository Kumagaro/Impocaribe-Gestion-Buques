import { healthResponseSchema } from '@impocaribe/shared/validation';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, createApiClient, defineEndpoint } from '../src/api/client';
import { getHealth } from '../src/api/endpoints/health';
import { createTestPlatform } from '../src/platform/test-platform';
import { createFakeServer, FIXED_TIME, sampleOf } from './fake-server';

// T026 · plan §11.2: utilidades de las pruebas de componente.

describe('sampleOf: respuestas generadas desde el esquema', () => {
  it('genera un valor válido de cada tipo', () => {
    const schema = z.object({
      id: z.uuid(),
      name: z.string().min(3),
      code: z.string().max(4),
      count: z.number().int().min(2),
      ok: z.boolean(),
      when: z.iso.datetime(),
      day: z.iso.date(),
      kind: z.enum(['dm', 'orden']),
      status: z.literal('emitida'),
      note: z.string().nullable(),
      tags: z.array(z.string()).min(2),
      nested: z.object({ tons: z.number().positive() }),
    });
    const value = sampleOf(schema);
    expect(schema.parse(value)).toEqual(value);
    expect([value.when, value.day, value.kind, value.status, value.tags.length, value.count]).toEqual([
      FIXED_TIME,
      '2026-10-14',
      'dm',
      'emitida',
      2,
      2,
    ]);
  });

  it('respeta lo que se da en overrides, también en objetos anidados', () => {
    const schema = z.object({ a: z.string(), nested: z.object({ b: z.number(), c: z.string() }) });
    expect(sampleOf(schema, { nested: { b: 42 } })).toEqual({
      a: 'texto de prueba',
      nested: { b: 42, c: 'texto de prueba' },
    });
  });

  it('un patrón no se inventa: hay que darlo, y se valida', () => {
    const schema = z.object({ chapa: z.string().regex(/^[A-Z]\d{6}$/) });
    expect(() => sampleOf(schema)).toThrow(
      'respuesta.chapa: el patrón ^[A-Z]\\d{6}$ no se genera solo; páselo en overrides',
    );
    expect(sampleOf(schema, { chapa: 'W011612' })).toEqual({ chapa: 'W011612' });
    expect(() => sampleOf(schema, { chapa: 'w1' })).toThrow('La respuesta generada no cumple su esquema');
  });
});

describe('createFakeServer', () => {
  const clientFor = (server: ReturnType<typeof createFakeServer>) =>
    createApiClient({
      baseUrl: server.baseUrl,
      appVersion: '1.0.0',
      getToken: async () => null,
      now: () => new Date(FIXED_TIME),
      transport: server.transport,
    });

  it('responde con un valor generado desde el esquema de salida y registra la llamada', async () => {
    const server = createFakeServer();
    server.respond(getHealth);
    const health = await clientFor(server).request(getHealth);
    expect(healthResponseSchema.parse(health)).toEqual({ status: 'ok', serverTime: FIXED_TIME });
    expect(server.calls.map((c) => [c.method, c.path, c.headers['X-App-Version']])).toEqual([
      ['GET', '/health', '1.0.0'],
    ]);
  });

  it('una respuesta de error llega como el error de negocio, con su estado HTTP', async () => {
    const server = createFakeServer();
    server.respond(getHealth, {
      code: 'SERVER_PROTECTED_MODE',
      message: 'Servidor en modo protegido por batería baja: solo consulta',
    });
    await expect(clientFor(server).request(getHealth)).rejects.toMatchObject({
      status: 503,
      code: 'SERVER_PROTECTED_MODE',
    });
  });

  it('una llamada sin respuesta preparada queda anotada y no se confunde con falta de conexión', async () => {
    const server = createFakeServer();
    const error = await clientFor(server)
      .request(getHealth)
      .catch((e: unknown) => e);
    expect([error instanceof ApiError && error.code, server.unhandled]).toEqual(['NOT_FOUND', ['GET /health']]);
  });

  it('valida la entrada como el servidor y devuelve los errores por campo', async () => {
    const save = defineEndpoint({
      method: 'POST',
      path: '/prueba-fake-server/:id',
      input: z.object({ carne: z.string().length(11, 'El carné debe tener 11 dígitos.') }),
    });
    const server = createFakeServer();
    server.respond(save);
    const error = await clientFor(server)
      .request(save, { params: { id: 'x1' }, body: { carne: '123' } })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { fields: { carne: 'El carné debe tener 11 dígitos.' } },
    });
  });

  it('solo acepta llamadas del registro de web', () => {
    const outside = { method: 'GET' as const, path: '/fuera-del-registro' };
    expect(() => createFakeServer().respond(outside)).toThrow(
      'GET /fuera-del-registro no está en el registro de llamadas (defineEndpoint)',
    );
  });

  it('sirve de transporte de la plataforma de prueba con sql.js', async () => {
    const server = createFakeServer();
    server.respond(getHealth);
    const platform = await createTestPlatform({ http: server.transport });
    const db = await platform.openDatabase('local');
    await db.execute('CREATE TABLE t (v TEXT)');
    const res = await platform.http(`${server.baseUrl}/health`, { method: 'GET' });
    await db.execute('INSERT INTO t VALUES (?)', [((await res.json()) as { status: string }).status]);
    expect(await db.query('SELECT v FROM t')).toEqual([{ v: 'ok' }]);
  });
});
