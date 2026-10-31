import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  capacitorBridge,
  capacitorPlugin,
  decodeBytes,
  encodeBytes,
  type ImpocaribeNativePlugin,
} from './capacitor-bridge';

// T118 · plan §10.2: la app Android usa el mismo puente que la de escritorio; por Capacitor solo viaja JSON.
const INFO = { platform: 'android' as const, appVersion: '1.4.0', smallestWidthDp: 360, name: 'Galaxy A14' };

function fakePlugin(reply: (channel: string, args: unknown[]) => unknown = () => undefined) {
  const calls: { channel: string; args: unknown[] }[] = [];
  const listeners: Record<string, (e: never) => void> = {};
  const plugin: ImpocaribeNativePlugin = {
    info: async () => INFO,
    invoke: async ({ channel, args }) => {
      calls.push({ channel, args });
      return { value: reply(channel, args) };
    },
    addListener: async (event: string, fn: (e: never) => void) => {
      listeners[event] = fn;
      return { remove: async () => undefined };
    },
  };
  return { plugin, calls, emit: (event: string, e: unknown) => listeners[event]!(e as never) };
}

afterEach(() => {
  delete (globalThis as { Capacitor?: unknown }).Capacitor;
});

describe('bytes por el puente de Capacitor', () => {
  it('Uint8Array va como { $bytes } en todo el árbol, y vuelve igual', () => {
    const value = { body: new Uint8Array([77, 90, 0, 255]), rows: [{ pdf: new Uint8Array([37, 80]) }], n: 3 };
    const encoded = encodeBytes(value);
    expect(encoded).toEqual({ body: { $bytes: 'TVoA/w==' }, rows: [{ pdf: { $bytes: 'JVA=' } }], n: 3 });
    expect(decodeBytes(JSON.parse(JSON.stringify(encoded)))).toEqual(value);
  });

  it('un objeto con más claves que $bytes no se toma por bytes', () => {
    expect(decodeBytes({ $bytes: 'AA==', otra: 1 })).toEqual({ $bytes: 'AA==', otra: 1 });
  });
});

describe('capacitorBridge', () => {
  it('lee la información una vez y lleva cada canal al plugin con sus bytes codificados', async () => {
    const { plugin, calls } = fakePlugin((channel) =>
      channel === 'db.query' ? [{ numero: 'EAGLE1-2026-V1-0042', pdf: { $bytes: 'JVA=' } }] : undefined,
    );
    const bridge = await capacitorBridge(plugin);
    expect(bridge.info).toEqual(INFO);
    await bridge.invoke('file.save', 'orden.pdf', new Uint8Array([37, 80]));
    expect(calls[0]).toEqual({ channel: 'file.save', args: ['orden.pdf', { $bytes: 'JVA=' }] });
    expect(await bridge.invoke('db.query', 1, 'SELECT numero, pdf FROM orden')).toEqual([
      { numero: 'EAGLE1-2026-V1-0042', pdf: new Uint8Array([37, 80]) },
    ]);
  });

  it('los eventos del WebSocket y del progreso llegan con su forma', async () => {
    const { plugin, emit } = fakePlugin();
    const bridge = await capacitorBridge(plugin);
    const socket = vi.fn();
    const progress = vi.fn();
    bridge.onSocket(socket);
    bridge.onUpdateProgress(progress);
    await Promise.resolve();
    emit('socket', { id: 4, event: 'message', data: '{"type":"ready"}' });
    emit('updateProgress', { received: 1024, total: 4096 });
    expect(socket).toHaveBeenCalledWith(4, 'message', '{"type":"ready"}');
    expect(progress).toHaveBeenCalledWith(1024, 4096);
  });

  it('solo dentro de la app Android hay plugin', () => {
    expect(capacitorPlugin()).toBeNull();
    const { plugin } = fakePlugin();
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => false,
      Plugins: { ImpocaribeNative: plugin },
    };
    expect(capacitorPlugin()).toBeNull();
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      Plugins: { ImpocaribeNative: plugin },
    };
    expect(capacitorPlugin()).toBe(plugin);
  });
});
