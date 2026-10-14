import { randomUUID } from 'node:crypto';
import { Body, Controller, Inject, Post, Req, Res, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ManualClock } from '@impocaribe/shared';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Request, Response } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Contract } from './contract.ts';
import { listenForTests } from '../../test/listen.ts';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { AppModule } from '../app.module.ts';
import { configureApp } from '../app.ts';
import { CLOCK, DB } from '../tokens.ts';
import { idempotencyRequest, purgeExpiredIdempotencyKeys, withIdempotency } from './idempotency.ts';

// T015 · DT-22, RF-ORD-23, D15: una misma escritura enviada varias veces produce como máximo un efecto.
const clock = new ManualClock('2026-10-14T12:00:00.000Z');
let suite: SuiteDb;
let db: NodePgDatabase;
let app: INestApplication;
let base: string;

// Controlador de ejemplo con un efecto real en la base: insertar una fila en `efectos`.
@Controller('ejemplo')
class EffectController {
  constructor(@Inject(DB) private readonly database: NodePgDatabase) {}

  @Post('efecto')
  @Contract({ roles: 'public' })
  async effect(@Req() req: Request, @Res() res: Response, @Body() body: { valor: string }) {
    const result = await withIdempotency(this.database, clock, idempotencyRequest(req), async (tx) => {
      const { rows } = await tx.execute<{ id: number }>(
        sql`INSERT INTO efectos (valor) VALUES (${body.valor}) RETURNING id`,
      );
      return { status: 201, body: { id: rows[0]!.id, valor: body.valor } };
    });
    res.status(result.status).json(result.body);
  }

  @Post('sin-cuerpo')
  @Contract({ roles: 'public' })
  async withoutBody(@Req() req: Request, @Res() res: Response) {
    const result = await withIdempotency(this.database, clock, idempotencyRequest(req), async (tx) => {
      await tx.execute(sql`INSERT INTO efectos (valor) VALUES ('sin-cuerpo')`);
      return { status: 201, body: { hecho: true } };
    });
    res.status(result.status).json(result.body);
  }
}

function post(key: string | undefined, body: unknown, device = 'tablet-1') {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-App-Version': '1.0.0',
    'X-Device-Id': device,
  };
  if (key) headers['Idempotency-Key'] = key;
  return fetch(`${base}/ejemplo/efecto`, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function effects(): Promise<string[]> {
  const { rows } = await suite.admin.query<{ valor: string }>('SELECT valor FROM efectos ORDER BY id');
  return rows.map((r) => r.valor);
}

beforeAll(async () => {
  suite = await createSuiteDb();
  await suite.admin.query('CREATE TABLE efectos (id serial PRIMARY KEY, valor text NOT NULL)');
  await suite.admin.query(
    'GRANT SELECT, INSERT ON efectos TO impocaribe_app; GRANT USAGE ON SEQUENCE efectos_id_seq TO impocaribe_app',
  );
  db = drizzle(suite.app);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [EffectController] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(DB)
    .useValue(db)
    .compile();
  app = configureApp(moduleRef.createNestApplication({ logger: false, rawBody: true }));
  base = `${await listenForTests(app)}/api/v1`;
}, 60_000);

afterAll(async () => {
  await app.close();
  await suite.drop();
});

beforeEach(async () => {
  await suite.admin.query('TRUNCATE efectos RESTART IDENTITY; TRUNCATE idempotency_keys');
  clock.set('2026-10-14T12:00:00.000Z');
});

describe('DT-22: Idempotency-Key obligatorio en las escrituras', () => {
  it('sin la cabecera responde 400 VALIDATION_ERROR y no hace nada', async () => {
    const res = await post(undefined, { valor: 'a' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Falta la cabecera Idempotency-Key: cada intento del usuario debe llevar un UUID propio.',
    });
    expect(await effects()).toEqual([]);
  });

  it('una clave que no es un UUID responde 400 VALIDATION_ERROR', async () => {
    const res = await post('clave-1', { valor: 'a' });
    expect(res.status).toBe(400);
    expect(await effects()).toEqual([]);
  });
});

describe('D15: un mismo intento produce como máximo un efecto', () => {
  it('la misma petición 5 veces en paralelo produce un solo efecto y la misma respuesta', async () => {
    const key = randomUUID();
    const responses = await Promise.all(Array.from({ length: 5 }, () => post(key, { valor: 'orden-1' })));
    const results = await Promise.all(responses.map(async (r) => ({ status: r.status, body: await r.json() })));
    expect(results).toEqual(Array.from({ length: 5 }, () => ({ status: 201, body: { id: 1, valor: 'orden-1' } })));
    expect(await effects()).toEqual(['orden-1']);
  });

  it('un reintento tras perder la respuesta devuelve el mismo resultado sin repetir el efecto', async () => {
    const key = randomUUID();
    const first = await post(key, { valor: 'orden-2' });
    const retry = await post(key, { valor: 'orden-2' });
    expect([first.status, await first.json()]).toEqual([201, { id: 1, valor: 'orden-2' }]);
    expect([retry.status, await retry.json()]).toEqual([201, { id: 1, valor: 'orden-2' }]);
    expect(await effects()).toEqual(['orden-2']);
  });

  it('claves distintas son intentos distintos', async () => {
    await post(randomUUID(), { valor: 'x' });
    await post(randomUUID(), { valor: 'x' });
    expect(await effects()).toEqual(['x', 'x']);
  });

  it('la misma clave en otro dispositivo es otro intento', async () => {
    const key = randomUUID();
    await post(key, { valor: 'x' }, 'tablet-1');
    await post(key, { valor: 'x' }, 'pc-oficina');
    expect(await effects()).toEqual(['x', 'x']);
  });

  it('una escritura sin cuerpo también es idempotente', async () => {
    const key = randomUUID();
    const send = () =>
      fetch(`${base}/ejemplo/sin-cuerpo`, {
        method: 'POST',
        headers: { 'X-App-Version': '1.0.0', 'Idempotency-Key': key },
      });
    expect([(await send()).status, (await send()).status]).toEqual([201, 201]);
    expect(await effects()).toEqual(['sin-cuerpo']);
  });

  it('la misma clave con otro contenido responde 409 IDEMPOTENCY_MISMATCH sin efecto', async () => {
    const key = randomUUID();
    await post(key, { valor: 'orden-3' });
    const res = await post(key, { valor: 'orden-3-modificada' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: 'IDEMPOTENCY_MISMATCH',
      message:
        'Esta petición reutiliza la clave de un intento anterior con otro contenido. Vuelva a intentarlo como una operación nueva.',
    });
    expect(await effects()).toEqual(['orden-3']);
  });

  it('guarda la clave 24 horas, ligada a su resultado', async () => {
    const key = randomUUID();
    await post(key, { valor: 'orden-4' });
    const { rows } = await suite.admin.query(
      'SELECT device_id, method, path, status_code, response, created_at, expires_at FROM idempotency_keys WHERE key = $1',
      [key],
    );
    expect(rows).toEqual([
      {
        device_id: 'tablet-1',
        method: 'POST',
        path: '/api/v1/ejemplo/efecto',
        status_code: 201,
        response: { id: 1, valor: 'orden-4' },
        created_at: new Date('2026-10-14T12:00:00.000Z'),
        expires_at: new Date('2026-10-15T12:00:00.000Z'),
      },
    ]);
  });
});

describe('plan §4.2: las claves se depuran al vencer', () => {
  it('borra solo las claves vencidas', async () => {
    const vieja = randomUUID();
    await post(vieja, { valor: 'vieja' });
    clock.set('2026-10-15T11:00:00.000Z');
    const nueva = randomUUID();
    await post(nueva, { valor: 'nueva' });
    clock.set('2026-10-15T12:00:00.001Z');
    expect(await purgeExpiredIdempotencyKeys(db, clock)).toBe(1);
    const { rows } = await suite.admin.query<{ key: string }>('SELECT key::text FROM idempotency_keys');
    expect(rows).toEqual([{ key: nueva }]);
  });

  it('a las 24 h exactas la clave ya venció: cuenta como un intento nuevo', async () => {
    const key = randomUUID();
    await post(key, { valor: 'orden-6' });
    clock.set('2026-10-15T12:00:00.000Z');
    await post(key, { valor: 'orden-6' });
    expect(await effects()).toEqual(['orden-6', 'orden-6']);
  });

  it('un instante antes de las 24 h la clave sigue vigente', async () => {
    const key = randomUUID();
    await post(key, { valor: 'orden-7' });
    clock.set('2026-10-15T11:59:59.999Z');
    await post(key, { valor: 'orden-7' });
    expect(await effects()).toEqual(['orden-7']);
  });

  it('una clave vencida pero aún no depurada cuenta como un intento nuevo', async () => {
    const key = randomUUID();
    await post(key, { valor: 'orden-5' });
    clock.set('2026-10-15T12:00:00.001Z');
    const res = await post(key, { valor: 'orden-5' });
    expect(await res.json()).toEqual({ id: 2, valor: 'orden-5' });
    expect(await effects()).toEqual(['orden-5', 'orden-5']);
  });
});
