import { describe, expect, it } from 'vitest';
import { serverName } from '../../domain/serverName.ts';
import { DEFAULT_SERVER_PORT, serverAddressSchema } from './F01.ts';

// ui-spec §6 F-01: dirección del servidor escrita a mano (P-01).
const parse = (v: string) => serverAddressSchema.safeParse(v);
const message = (v: string) => parse(v).error?.issues[0]?.message;

describe('F-01 Dirección', () => {
  it.each([
    ['192.168.1.10', { address: '192.168.1.10', port: DEFAULT_SERVER_PORT }],
    [' 192.168.1.10:8443 ', { address: '192.168.1.10', port: 8443 }],
    ['10.0.0.1:1', { address: '10.0.0.1', port: 1 }],
    ['PC-SERVIDOR', { address: 'pc-servidor', port: DEFAULT_SERVER_PORT }],
    ['pc-servidor.local:65535', { address: 'pc-servidor.local', port: 65535 }],
  ])('acepta %s', (v, out) => {
    expect(parse(v).data).toEqual(out);
  });

  it.each(['192.168.1.256', '192.168.1', '1.2.3.4.5', 'pc servidor', '-pc', 'http://192.168.1.10', '::1'])(
    'rechaza %s',
    (v) => {
      expect(message(v)).toContain('IPv4');
    },
  );

  it('el puerto va de 1 a 65535 y la dirección es obligatoria', () => {
    expect(message('192.168.1.10:0')).toBe('El puerto va de 1 a 65535.');
    expect(message('192.168.1.10:65536')).toBe('El puerto va de 1 a 65535.');
    expect(message('  ')).toBe('Escriba la dirección del servidor.');
  });
});

describe('RF-RED-03: nombre corto del servidor', () => {
  it('IMPOCARIBE- y los 4 primeros caracteres del UUID en mayúsculas', () => {
    expect(serverName('7f3c2a10-1b2c-4d5e-8f90-abcdef123456')).toBe('IMPOCARIBE-7F3C');
  });
});
