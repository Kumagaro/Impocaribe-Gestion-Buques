import { healthResponseSchema } from '@impocaribe/shared/validation';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../../packages/server/src/app.module.ts';
import { apiRegistry } from '../../packages/web/src/api/endpoints/index.ts';
import { checkContract, routeTable, type ServerRoute } from './contract.ts';

// T026 · plan §7.6 y §11.2: cada llamada de web existe en el servidor con los mismos esquemas, errores y roles.

describe('contrato entre web y servidor', () => {
  it('todas las llamadas del registro de web coinciden con el servidor', () => {
    expect(apiRegistry.length).toBeGreaterThan(0);
    expect(checkContract(apiRegistry, routeTable(AppModule))).toEqual([]);
  });

  it('la tabla de rutas incluye /health con su contrato', () => {
    expect(routeTable(AppModule).map((r) => [r.method, r.path, r.declared, r.roles])).toContainEqual([
      'GET',
      '/health',
      true,
      'public',
    ]);
  });
});

describe('checkContract detecta cada desajuste', () => {
  const server: ServerRoute[] = [
    {
      method: 'GET',
      path: '/buques/:id',
      declared: true,
      output: z.object({ id: z.string() }),
      errors: ['NOT_FOUND'],
      roles: ['apoderada', 'operador', 'lectura'],
    },
    { method: 'POST', path: '/sin-contrato', declared: false },
    { method: 'GET', path: '/health', declared: true, output: healthResponseSchema, roles: 'public' },
  ];

  it('una pantalla de ejemplo con una llamada inexistente en el servidor hace fallar el contrato', () => {
    expect(checkContract([{ method: 'GET', path: '/pantalla-de-ejemplo/no-existe' }], server)).toEqual([
      'GET /pantalla-de-ejemplo/no-existe: no existe en el servidor',
    ]);
  });

  it('el mismo camino con otro método tampoco existe', () => {
    expect(checkContract([{ method: 'DELETE', path: '/health' }], server)).toEqual([
      'DELETE /health: no existe en el servidor',
    ]);
  });

  it('los nombres de los parámetros pueden variar', () => {
    const call = {
      method: 'GET',
      path: '/buques/:vesselId',
      output: z.object({ id: z.string() }),
      errors: ['NOT_FOUND'],
      roles: ['lectura', 'operador', 'apoderada'],
    };
    expect(checkContract([call], server)).toEqual([]);
  });

  it('esquemas, errores y roles distintos', () => {
    const call = {
      method: 'GET',
      path: '/buques/:id',
      input: z.object({ q: z.string() }),
      output: z.object({ id: z.number() }),
      errors: ['NOT_FOUND', 'STALE_RECORD'],
      roles: ['apoderada'],
    };
    expect(checkContract([call], server)).toEqual([
      'GET /buques/:id: el esquema de entrada no coincide',
      'GET /buques/:id: el esquema de salida no coincide',
      'GET /buques/:id: los códigos de error no coinciden',
      'GET /buques/:id: los roles no coinciden',
    ]);
  });

  it('una ruta sin @Contract no puede cumplir el contrato', () => {
    expect(checkContract([{ method: 'POST', path: '/sin-contrato' }], server)).toEqual([
      'POST /sin-contrato: la ruta del servidor no declara su contrato (@Contract)',
    ]);
  });
});
