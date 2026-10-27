import { describe, expect, it } from 'vitest';
import { canCreateServer, checkServerPc, type PcFacts } from './serverChecks.ts';

// T126 y T127 · RNF-19 y ui-spec P-28 paso 1: 4 GB funciona con aviso ámbar, 8 GB recomendados, 20 GB de disco,
// Windows 10 u 11 de 64 bits, y con un servidor ya en la red no se continúa.
const GB = 1024 ** 3;
const good: PcFacts = {
  existingServer: null,
  windowsBuild: 22631,
  is64bit: true,
  memoryBytes: 8 * GB,
  freeDiskBytes: 86 * GB,
  network: { kind: 'wifi', name: 'Almacén Impocaribe', address: '192.168.1.10' },
  busyPorts: [],
  hasBattery: true,
};
const level = (f: Partial<PcFacts>, id: string) => checkServerPc({ ...good, ...f }).find((c) => c.id === id)!.level;

describe('comprobación de la PC servidor', () => {
  it('una PC que cumple todo queda en verde y deja continuar', () => {
    const checks = checkServerPc(good);
    expect(checks.map((c) => c.level)).toEqual(Array(7).fill('ok'));
    expect(canCreateServer(checks)).toBe(true);
    expect(checks.find((c) => c.id === 'windows')!.title).toBe('Windows 11 de 64 bits');
  });

  it('memoria: 4 GB ámbar con el texto de P-28, menos de 4 rojo, 8 o más verde (lo que Windows ve de 4 GB cuenta)', () => {
    const at4 = checkServerPc({ ...good, memoryBytes: 3.9 * GB }).find((c) => c.id === 'memory')!;
    expect(at4).toEqual({
      id: 'memory',
      level: 'warn',
      title: 'Memoria: 4 GB',
      detail: 'Funcionará, aunque más lento; se recomiendan 8 GB.',
    });
    expect(level({ memoryBytes: 3 * GB }, 'memory')).toBe('bad');
    expect(level({ memoryBytes: 7.6 * GB }, 'memory')).toBe('ok');
    expect(canCreateServer(checkServerPc({ ...good, memoryBytes: 4 * GB }))).toBe(true);
  });

  it('disco: 20 GB libres bastan; 19,9 no', () => {
    expect(level({ freeDiskBytes: 20 * GB }, 'disk')).toBe('ok');
    expect(level({ freeDiskBytes: 19.9 * GB }, 'disk')).toBe('bad');
  });

  it('Windows: desde 10 (compilación 10240) y de 64 bits', () => {
    expect(checkServerPc({ ...good, windowsBuild: 19045 }).find((c) => c.id === 'windows')!.title).toBe(
      'Windows 10 de 64 bits',
    );
    expect(level({ windowsBuild: 9600 }, 'windows')).toBe('bad');
    expect(level({ is64bit: false }, 'windows')).toBe('bad');
  });

  it('con un servidor ya en la red, rojo y no deja continuar', () => {
    const checks = checkServerPc({ ...good, existingServer: { name: 'IMPOCARIBE-7F3C', address: '192.168.1.10' } });
    expect(checks[0]!.level).toBe('bad');
    expect(checks[0]!.title).toBe('Ya hay un servidor en esta red: IMPOCARIBE-7F3C');
    expect(canCreateServer(checks)).toBe(false);
  });

  it('sin red o con un puerto ocupado no deja continuar; sin batería solo avisa', () => {
    expect(canCreateServer(checkServerPc({ ...good, network: null }))).toBe(false);
    expect(canCreateServer(checkServerPc({ ...good, busyPorts: [8443] }))).toBe(false);
    expect(level({ hasBattery: false }, 'power')).toBe('warn');
    expect(canCreateServer(checkServerPc({ ...good, hasBattery: false }))).toBe(true);
  });
});
