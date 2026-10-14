import { Body, Controller, Get, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppError, ManualClock } from '@impocaribe/shared';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.ts';
import { configureApp } from './app.ts';
import { CLOCK, MIN_APP_VERSION } from './tokens.ts';
import { ZodValidationPipe } from './http/zod-validation.pipe.ts';

// T011 · plan §6 (convenciones, §6.1 formato de error), DT-11 (426), §9 (helmet y CSP estricta) y CORS de §6.

const echoSchema = z.object({
  dmNumber: z.string().regex(/^\d{5}$/, 'El número de DM debe tener 5 dígitos.'),
  brand: z.string().min(2, 'La marca debe tener al menos 2 caracteres.'),
});

// Controlador de ejemplo que ejercita el filtro de errores y la validación reales.
@Controller('ejemplo')
class ExampleController {
  @Get('negocio')
  business(): never {
    throw new AppError(
      'OVERDRAFT_ALLOCATION',
      'Sobregiro: la orden supera el saldo por 7,280 t. Quedan 10,000 t en el DM 00431 (buque EAGLE1).',
      { requested: '17.280', balance: '10.000', excess: '7.280' },
    );
  }

  @Get('falla')
  failure(): never {
    throw new Error('detalle técnico interno');
  }

  @Post('eco')
  echo(@Body(new ZodValidationPipe(echoSchema)) body: z.infer<typeof echoSchema>) {
    return body;
  }
}

let app: INestApplication;
let base: string;
const APP = { 'X-App-Version': '1.2.0' };

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [ExampleController] })
    .overrideProvider(CLOCK)
    .useValue(new ManualClock('2026-10-14T12:00:00.000Z'))
    .overrideProvider(MIN_APP_VERSION)
    .useValue('1.2.0')
    .compile();
  app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1`;
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/health', () => {
  it('responde 200 con status y la hora del servidor (serverTime)', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', serverTime: '2026-10-14T12:00:00.000Z' });
  });

  it('no existe sin el prefijo versionado /api/v1', async () => {
    const res = await fetch(`${base.replace('/api/v1', '')}/health`);
    expect(res.status).toBe(404);
  });
});

describe('plan §6.1: formato de error', () => {
  it('un error de negocio responde con su estado, código, mensaje y detalles', async () => {
    const res = await fetch(`${base}/ejemplo/negocio`, { headers: APP });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      code: 'OVERDRAFT_ALLOCATION',
      message: 'Sobregiro: la orden supera el saldo por 7,280 t. Quedan 10,000 t en el DM 00431 (buque EAGLE1).',
      details: { requested: '17.280', balance: '10.000', excess: '7.280' },
    });
  });

  it('un fallo inesperado responde 500 sin revelar el detalle técnico', async () => {
    const res = await fetch(`${base}/ejemplo/falla`, { headers: APP });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor. Inténtelo de nuevo; si se repite, avise al responsable.',
    });
  });

  it('una ruta inexistente responde 404 NOT_FOUND', async () => {
    const res = await fetch(`${base}/no-existe`, { headers: APP });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: 'NOT_FOUND', message: 'La ruta solicitada no existe.' });
  });
});

describe('validación con Zod (RF-VAL-04)', () => {
  it('un cuerpo inválido responde 400 VALIDATION_ERROR con el error de cada campo', async () => {
    const res = await fetch(`${base}/ejemplo/eco`, {
      method: 'POST',
      headers: { ...APP, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dmNumber: '0431', brand: 'X' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Hay 2 campos por corregir.',
      details: {
        fields: {
          dmNumber: 'El número de DM debe tener 5 dígitos.',
          brand: 'La marca debe tener al menos 2 caracteres.',
        },
      },
    });
  });

  it('un cuerpo válido llega al controlador ya validado', async () => {
    const res = await fetch(`${base}/ejemplo/eco`, {
      method: 'POST',
      headers: { ...APP, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dmNumber: '00431', brand: 'NEVADA', extra: 'se descarta' }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ dmNumber: '00431', brand: 'NEVADA' });
  });

  it('un JSON mal formado responde 400 VALIDATION_ERROR', async () => {
    const res = await fetch(`${base}/ejemplo/eco`, {
      method: 'POST',
      headers: { ...APP, 'Content-Type': 'application/json' },
      body: '{ no es json',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'VALIDATION_ERROR', message: 'La petición no es válida.' });
  });
});

describe('DT-11: versión mínima de la app', () => {
  it('por debajo de la mínima responde 426 UPGRADE_REQUIRED', async () => {
    const res = await fetch(`${base}/ejemplo/negocio`, { headers: { 'X-App-Version': '1.1.9' } });
    expect(res.status).toBe(426);
    expect(await res.json()).toEqual({
      code: 'UPGRADE_REQUIRED',
      message: 'Esta versión de la app (1.1.9) ya no es compatible. Actualícela a la 1.2.0 o superior.',
      details: { appVersion: '1.1.9', minVersion: '1.2.0' },
    });
  });

  it('sin el header X-App-Version responde 426', async () => {
    const res = await fetch(`${base}/ejemplo/negocio`);
    expect(res.status).toBe(426);
  });

  it.each(['/health', '/discovery', '/updates/check'])(
    '%s no exige versión (una app vieja debe poder actualizarse)',
    async (path) => {
      const res = await fetch(`${base}${path}`);
      expect(res.status).not.toBe(426);
    },
  );
});

describe('plan §9 y §6: cabeceras de seguridad y CORS', () => {
  it('envía la CSP estricta, sin recursos externos', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none';frame-ancestors 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it.each(['app://impocaribe', 'https://localhost', 'capacitor://localhost'])(
    'permite el origen %s',
    async (origin) => {
      const res = await fetch(`${base}/health`, { headers: { Origin: origin } });
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    },
  );

  it('no permite otros orígenes', async () => {
    const res = await fetch(`${base}/health`, { headers: { Origin: 'http://intruso.local' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('la verificación previa de CORS no exige X-App-Version', async () => {
    const res = await fetch(`${base}/ejemplo/eco`, {
      method: 'OPTIONS',
      headers: { Origin: 'app://impocaribe', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(204);
  });
});
