import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pairingCode } from './pairingCode.ts';

// RF-RED-04 y plan §9: el código de 6 dígitos sale de la huella de la CA y de dos valores aleatorios (uno del
// dispositivo, otro del servidor). Si un intermediario se interpone, los códigos de cada extremo no coinciden.
// Oráculo independiente: SHA-256 de "huella normalizada|nonce cliente|nonce servidor"; los 4 primeros bytes como entero
// sin signo, módulo 1 000 000, con ceros a la izquierda.
function oracle(fp: string, client: string, server: string): string {
  const digest = createHash('sha256')
    .update(`${fp.replaceAll(':', '').toLowerCase()}|${client}|${server}`)
    .digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

// fast-check 4 ya no trae hexaString.
const HEX64 = fc.string({ unit: fc.constantFrom(...'0123456789abcdef'), minLength: 64, maxLength: 64 });
const FP = 'B2:99:E6:FB:83:56:99:BC:6C:95:39:54:06:8C:89:82:B1:0B:E0:26:EA:79:49:D7:A6:ED:10:2A:0C:0D:F5:4D';

describe('pairingCode', () => {
  it('coincide con el oráculo y siempre tiene 6 dígitos', async () => {
    const code = await pairingCode(FP, 'nonce-del-telefono', 'nonce-del-servidor');
    expect(code).toBe(oracle(FP, 'nonce-del-telefono', 'nonce-del-servidor'));
    expect(code).toMatch(/^\d{6}$/);
  });

  it('la huella se compara sin dos puntos ni mayúsculas', async () => {
    expect(await pairingCode(FP, 'a', 'b')).toBe(await pairingCode(FP.replaceAll(':', '').toLowerCase(), 'a', 'b'));
  });

  it('un intermediario con otra CA produce otro código en el dispositivo', async () => {
    const intruder = 'AA:' + FP.slice(3);
    expect(await pairingCode(intruder, 'a', 'b')).not.toBe(await pairingCode(FP, 'a', 'b'));
  });

  it('propiedad: igual al oráculo para cualquier huella y nonces', async () => {
    await fc.assert(
      fc.asyncProperty(HEX64, fc.string(), fc.string(), async (fp, c, s) => {
        expect(await pairingCode(fp, c, s)).toBe(oracle(fp, c, s));
      }),
      { numRuns: 300 },
    );
  });
});
