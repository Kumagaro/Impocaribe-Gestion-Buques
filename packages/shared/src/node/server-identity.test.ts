import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyServerChain, type PairedServer } from './server-identity.ts';

// T021 · DT-18 y RF-RED-03: el servidor se reconoce por su identidad y por la CA aprendida al emparejarse, nunca por su IP.
const cert = (name: string) =>
  new X509Certificate(readFileSync(new URL(`../../test-certs/${name}.crt`, import.meta.url)));
const ca = cert('ca');
const paired: PairedServer = { identity: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456', caFingerprint: ca.fingerprint256 };
// Los certificados de prueba se emitieron el 14/10/2026 y valen 100 años.
const NOW = new Date('2027-01-01T12:00:00.000Z');

describe('verifyServerChain', () => {
  it('acepta el certificado de la identidad emparejada firmado por la CA aprendida', () => {
    expect(verifyServerChain([cert('server'), ca], paired, NOW)).toEqual({ ok: true });
  });

  it('la huella se compara sin importar mayúsculas ni separadores', () => {
    const relaxed = { ...paired, caFingerprint: ca.fingerprint256.replaceAll(':', '').toLowerCase() };
    expect(verifyServerChain([cert('server'), ca], relaxed, NOW)).toEqual({ ok: true });
  });

  it('rechaza un certificado de otra CA aunque declare la misma identidad', () => {
    expect(verifyServerChain([cert('intruder'), cert('rogue-ca')], paired, NOW)).toEqual({
      ok: false,
      reason: 'La autoridad de certificación no es la de este servidor: puede ser un equipo intruso.',
    });
  });

  it('rechaza un certificado de otra CA aunque la cadena incluya también la CA buena', () => {
    expect(verifyServerChain([cert('intruder'), ca], paired, NOW)).toEqual({
      ok: false,
      reason: 'La autoridad de certificación no es la de este servidor: puede ser un equipo intruso.',
    });
  });

  it('rechaza un certificado de la CA correcta con otra identidad', () => {
    expect(verifyServerChain([cert('other-identity'), ca], paired, NOW)).toEqual({
      ok: false,
      reason: 'El certificado no corresponde al servidor emparejado.',
    });
  });

  it('rechaza una cadena vacía', () => {
    expect(verifyServerChain([], paired, NOW)).toEqual({
      ok: false,
      reason: 'La autoridad de certificación no es la de este servidor: puede ser un equipo intruso.',
    });
  });

  it('rechaza un certificado fuera de su periodo de validez', () => {
    expect(verifyServerChain([cert('server'), ca], paired, new Date('2200-01-01T00:00:00Z'))).toEqual({
      ok: false,
      reason: 'El certificado del servidor está vencido o todavía no es válido.',
    });
    expect(verifyServerChain([cert('server'), ca], paired, new Date('2000-01-01T00:00:00Z'))).toEqual({
      ok: false,
      reason: 'El certificado del servidor está vencido o todavía no es válido.',
    });
  });
});
