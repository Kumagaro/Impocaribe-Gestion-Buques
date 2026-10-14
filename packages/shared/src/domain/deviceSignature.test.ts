import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bodyHash, signRequest } from './deviceSignature.ts';

// T015 · DT-24: firma HMAC-SHA256 con el secreto del dispositivo sobre método, ruta, tiempo y hash del cuerpo.
// Oráculo independiente: las funciones de Node (createHmac, createHash), no el código probado (que usa Web Crypto).
const SECRET = 'c2VjcmV0by1kZWwtZGlzcG9zaXRpdm8tZGUtcHJ1ZWJh';

describe('bodyHash', () => {
  it('es el SHA-256 en hexadecimal del cuerpo', async () => {
    const body = '{"dmNumber":"00431","tons":"17.280"}';
    expect(await bodyHash(body)).toBe(createHash('sha256').update(body).digest('hex'));
  });

  it('un cuerpo vacío también tiene hash', async () => {
    expect(await bodyHash('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('signRequest', () => {
  const request = { method: 'post', path: '/api/v1/orders', time: '1792065600000', body: '{"tons":"17.280"}' };

  it('firma "MÉTODO\\nruta\\ntiempo\\nhash del cuerpo" con HMAC-SHA256 en hexadecimal', async () => {
    const canonical = `POST\n/api/v1/orders\n1792065600000\n${createHash('sha256').update(request.body).digest('hex')}`;
    expect(await signRequest(request, SECRET)).toBe(createHmac('sha256', SECRET).update(canonical).digest('hex'));
  });

  it.each([
    ['otro método', { ...request, method: 'PATCH' }],
    ['otra ruta', { ...request, path: '/api/v1/orders/1/void' }],
    ['otro tiempo', { ...request, time: '1792065600001' }],
    ['otro cuerpo', { ...request, body: '{"tons":"99.000"}' }],
  ])('cambia con %s', async (_name, other) => {
    expect(await signRequest(other, SECRET)).not.toBe(await signRequest(request, SECRET));
  });

  it('cambia con otro secreto', async () => {
    expect(await signRequest(request, 'otro-secreto')).not.toBe(await signRequest(request, SECRET));
  });
});
