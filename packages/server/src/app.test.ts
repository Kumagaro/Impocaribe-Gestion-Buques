import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';

// T003: el servidor responde GET /api/v1/health (tasks.md T003; plan §10.3 paso 10).
describe('GET /api/v1/health', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 con status "ok"', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('no expone la ruta sin el prefijo versionado', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(404);
  });
});
