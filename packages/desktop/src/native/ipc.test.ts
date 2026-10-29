import { NATIVE_CHANNELS } from '@impocaribe/shared';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { nativeHandlers, registerNative, type NativeServices } from './ipc.ts';

// T115 · plan §10.1: cada canal del puente llega a su servicio, y lo que manda el renderizador se comprueba.
const SERVER = { serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456', caFingerprint: 'AB:CD' };

function services() {
  return {
    transport: {
      http: vi.fn(async () => ({ status: 200, headers: [], body: null })),
      open: vi.fn(() => 7),
      send: vi.fn(),
      close: vi.fn(),
    },
    secure: { get: vi.fn(() => 'valor'), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) },
    databases: { openDatabase: vi.fn(async () => 1), execute: vi.fn(), query: vi.fn(() => []) },
    discovery: {
      browse: vi.fn(async () => []),
      broadcast: vi.fn(async () => []),
      probe: vi.fn(async () => null),
      subnet: vi.fn(() => ['192.168.1.1']),
    },
    saveFile: vi.fn(async () => undefined),
    notify: vi.fn(),
    secureScreen: vi.fn(),
  };
}
const as = (s: ReturnType<typeof services>) => s as unknown as NativeServices;

describe('canales del puente nativo', () => {
  it('registra cada canal de NATIVE_CHANNELS como native:<canal>', () => {
    const handle = vi.fn();
    registerNative(handle, as(services()));
    expect(handle.mock.calls.map(([c]) => c)).toEqual(NATIVE_CHANNELS.map((c) => `native:${c}`));
  });

  it('el preload deja pasar exactamente los mismos canales', () => {
    const preload = readFileSync(new URL('../preload.cts', import.meta.url), 'utf8');
    const list = preload.slice(preload.indexOf('PRELOAD_CHANNELS'), preload.indexOf('];'));
    expect([...list.matchAll(/'([a-zA-Z.]+)'/g)].map((m) => m[1])).toEqual([...NATIVE_CHANNELS]);
  });

  it('lleva cada llamada a su servicio con sus argumentos', async () => {
    const s = services();
    const h = nativeHandlers(as(s));
    const init = { method: 'GET', headers: {}, body: null };
    await h.http('https://192.168.1.20:8443/api/v1/health', init, SERVER);
    expect(s.transport.http).toHaveBeenCalledWith('https://192.168.1.20:8443/api/v1/health', init, SERVER);
    expect(h['ws.open']('wss://192.168.1.20:8443/api/v1/ws', SERVER)).toBe(7);
    h['db.execute'](1, 'INSERT INTO t VALUES (?)', ['x']);
    expect(s.databases.execute).toHaveBeenCalledWith(1, 'INSERT INTO t VALUES (?)', ['x']);
    expect(h['secure.get']('impocaribe.pairing')).toBe('valor');
    h.notify({ title: 'Alerta: Saldo', body: 'DM 00431' });
    expect(s.notify).toHaveBeenCalledWith('Alerta: Saldo', 'DM 00431');
    h.secureScreen('sí');
    expect(s.secureScreen).toHaveBeenCalledWith(false);
  });

  it('rechaza argumentos mal formados antes de llegar al servicio', () => {
    const s = services();
    const h = nativeHandlers(as(s));
    expect(() => h.http(42, {}, SERVER)).toThrow('Falta la dirección.');
    expect(() => h.http('https://x', {}, { serverId: 'x' })).toThrow('Falta la huella.');
    expect(() => h['ws.send']('1', 'hola')).toThrow('Falta el socket.');
    expect(() => h['db.query'](1, { sql: 'SELECT 1' })).toThrow('Falta la consulta.');
    expect(() => h['file.save']('orden.pdf', 'no son bytes')).toThrow('Falta el contenido del archivo.');
    expect(s.transport.http).not.toHaveBeenCalled();
    expect(s.databases.query).not.toHaveBeenCalled();
    expect(s.saveFile).not.toHaveBeenCalled();
  });

  // T127 · P-28: el ayudante de instalación, solo con el instalador completo; la petición se filtra campo a campo.
  it('el ayudante: solo operaciones y campos conocidos, y nada sin el instalador completo', async () => {
    const setup = {
      facts: vi.fn(async () => ({})),
      checkCode: vi.fn(async () => true),
      run: vi.fn(async () => ({ ok: true })),
      current: vi.fn(() => ({ running: false, operation: null, messages: [] })),
    };
    const h = nativeHandlers(as({ ...services(), setup } as never));
    await h['setup.run']('crear', { network: 'hotspot', code: 'K7QM-3XTP-R2HW', otro: 'x' });
    expect(setup.run).toHaveBeenCalledWith('crear', { network: 'hotspot', code: 'K7QM-3XTP-R2HW' });
    expect(() => h['setup.run']('borrar-todo', {})).toThrow('Operación desconocida.');
    expect(() => h['setup.run']('crear', { network: 'satélite' })).toThrow('Montaje de red desconocido.');
    expect(() => h['setup.run']('restablecer', { code: 'K7QM-3XTP-R2HW', password: 1 })).toThrow(
      'Falta la contraseña.',
    );
    expect(() => h['setup.code'](123)).toThrow('Falta el código.');
    expect(setup.run).toHaveBeenCalledTimes(1);

    const attention = vi.fn();
    const withWindow = nativeHandlers(as({ ...services(), setup, attention } as never));
    withWindow['window.attention']();
    expect(attention).toHaveBeenCalledTimes(1);

    const light = nativeHandlers(as({ ...services(), setup: null } as never));
    expect(() => light['setup.facts']()).toThrow('no la puso el instalador completo');
    expect(light['setup.state']()).toEqual({ running: false, operation: null, messages: [] });
  });
});
