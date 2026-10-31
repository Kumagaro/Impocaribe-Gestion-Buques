import { installationCodeSchema } from '@impocaribe/shared/validation';
import { describe, expect, it } from 'vitest';
import { leaks, newInstallationCode } from './codigo.ts';

// T125 · RF-INS-02: el código de instalación se genera por empresa y nunca va dentro del paquete.
describe('código de instalación', () => {
  it('tiene la forma que acepta el formulario y el ayudante (XXXX-XXXX-XXXX, sin caracteres confusos)', () => {
    for (let i = 0; i < 200; i++) {
      const code = newInstallationCode();
      expect(installationCodeSchema.parse(code)).toBe(code);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('sale del azar que se le pasa, posición por posición', () => {
    let n = 0;
    expect(newInstallationCode(() => n++ % 3)).toBe('ABCA-BCAB-CABC');
  });
});

describe('el código no queda en el paquete', () => {
  const code = 'K7QM-3XTP-R2HW';
  const file = (path: string, text: string, encoding: BufferEncoding = 'utf8') => ({
    path,
    bytes: Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(text, encoding), Buffer.from([3])]),
  });

  it('lo encuentra con o sin guiones, en minúsculas y en UTF-16 (cadenas de Windows)', () => {
    expect(
      leaks(
        [
          file('a.json', `{"code":"${code}"}`),
          file('b.txt', 'k7qm3xtpr2hw'),
          file('c.exe', code, 'utf16le'),
          file('d.hash', '$argon2id$v=19$m=65536,t=3,p=1$c2Fs$aGFzaA'),
        ],
        code,
      ),
    ).toEqual(['a.json', 'b.txt', 'c.exe']);
  });

  it('no confunde un código parecido', () => {
    expect(leaks([file('a.txt', 'K7QM-3XTP-R2HX')], code)).toEqual([]);
  });
});
