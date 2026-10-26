// @vitest-environment node
// (FormData, Blob y Request nativos, como en el renderizador de Electron; los de jsdom no se mezclan con los de Node.)
import type { NativeBridge, NativeSocketEvent } from '@impocaribe/shared';
import { describe, expect, it, vi } from 'vitest';
import { createElectronPlatform } from './electron-platform';

// T115 · plan §10.1: la plataforma de escritorio traduce cada llamada al canal del puente que corresponde.
const SERVER = { serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456', caFingerprint: 'AB:CD' };

function fakeBridge(reply: (channel: string, args: unknown[]) => unknown = () => undefined) {
  const calls: [string, unknown[]][] = [];
  let socketListener: (id: number, event: NativeSocketEvent, data?: string) => void = () => undefined;
  let progressListener: (received: number, total: number) => void = () => undefined;
  const bridge: NativeBridge = {
    info: { platform: 'windows', appVersion: '1.4.0', smallestWidthDp: 1024, name: 'PC-OFICINA' },
    invoke: async (channel, ...args) => {
      calls.push([channel, args]);
      return reply(channel, args);
    },
    onSocket: (l) => (socketListener = l),
    onUpdateProgress: (l) => (progressListener = l),
  };
  return {
    bridge,
    calls,
    emit: (id: number, e: NativeSocketEvent, d?: string) => socketListener(id, e, d),
    progress: (r: number, t: number) => progressListener(r, t),
  };
}

describe('createElectronPlatform', () => {
  it('HTTP por el puente con el servidor esperado; la respuesta vuelve como Response', async () => {
    const { bridge, calls } = fakeBridge(() => ({
      status: 200,
      headers: [['content-type', 'application/json']],
      body: new TextEncoder().encode('{"status":"ok"}'),
    }));
    const p = createElectronPlatform(bridge);
    const res = await p.http('https://192.168.1.20:8443/api/v1/health', { method: 'GET', headers: { A: 'b' } }, SERVER);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(calls).toEqual([
      ['http', ['https://192.168.1.20:8443/api/v1/health', { method: 'GET', headers: { A: 'b' }, body: null }, SERVER]],
    ]);
    expect(p.deviceInfo().name).toBe('PC-OFICINA');
    expect(p.serverScheme).toBe('https');
  });

  it('un multipart se envía en bytes con su límite en el Content-Type', async () => {
    const { bridge, calls } = fakeBridge(() => ({ status: 201, headers: [], body: null }));
    const form = new FormData();
    form.append('version', '1.4.0');
    form.append('file', new Blob([new Uint8Array([77, 90])]), 'impocaribe-1.4.0.exe');
    await createElectronPlatform(bridge).http('https://s/api/v1/updates', { method: 'POST', body: form }, SERVER);
    const sent = calls[0]![1][1] as { headers: Record<string, string>; body: Uint8Array };
    expect(sent.headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
    const text = new TextDecoder().decode(sent.body);
    expect(text).toContain('name="version"');
    expect(text).toContain('filename="impocaribe-1.4.0.exe"');
  });

  it('WebSocket: lo enviado antes de abrir se manda después, y un evento temprano no se pierde', async () => {
    const { bridge, calls, emit } = fakeBridge((channel) => (channel === 'ws.open' ? 5 : undefined));
    const socket = createElectronPlatform(bridge).ws('wss://s/api/v1/ws', SERVER);
    const opened = vi.fn();
    const messages: (string | undefined)[] = [];
    socket.on('open', opened);
    socket.on('message', (d) => messages.push(d));
    socket.send('{"type":"auth"}');
    emit(5, 'open'); // llega antes de que la promesa de ws.open se resuelva
    await vi.waitFor(() => expect(opened).toHaveBeenCalled());
    emit(5, 'message', '{"type":"ready"}');
    expect(messages).toEqual(['{"type":"ready"}']);
    expect(calls.map(([c, a]) => [c, a])).toEqual([
      ['ws.open', ['wss://s/api/v1/ws', SERVER]],
      ['ws.send', [5, '{"type":"auth"}']],
    ]);
    socket.close();
    expect(calls.at(-1)).toEqual(['ws.close', [5]]);
  });

  it('la copia local: una transacción entera antes de lo que llega después; si falla, se deshace', async () => {
    const { bridge, calls } = fakeBridge((channel, args) => {
      if (channel === 'db.open') return 3;
      if (channel === 'db.execute' && args[1] === 'INSERT INTO t VALUES (2)') throw new Error('UNIQUE');
      return channel === 'db.query' ? [{ n: 1 }] : undefined;
    });
    const db = await createElectronPlatform(bridge).openDatabase('impocaribe');
    const tx = db.transaction(async (t) => {
      await t.execute('INSERT INTO t VALUES (1)');
      await t.execute('INSERT INTO t VALUES (2)');
    });
    const after = db.query('SELECT count(*) AS n FROM t');
    await expect(tx).rejects.toThrow('UNIQUE');
    expect(await after).toEqual([{ n: 1 }]);
    expect(calls.filter(([c]) => c !== 'db.open').map(([, a]) => a[1])).toEqual([
      'BEGIN IMMEDIATE',
      'INSERT INTO t VALUES (1)',
      'INSERT INTO t VALUES (2)',
      'ROLLBACK',
      'SELECT count(*) AS n FROM t',
    ]);
  });

  it('T117: instalar solo le pasa la versión al proceso principal (él decide servidor y huella) y avisa el progreso', async () => {
    const { bridge, calls, progress } = fakeBridge(() => {
      progress(1024, 4096);
      return undefined;
    });
    const seen: [number, number][] = [];
    const update = { url: 'https://s/api/v1/updates/windows/1.4.0/download', version: '1.4.0', sha256: 'a'.repeat(64) };
    await createElectronPlatform(bridge).installUpdate!({ ...update, server: SERVER }, (r, t) => seen.push([r, t]));
    expect(calls).toEqual([['update.install', [{ version: '1.4.0' }]]]);
    expect(seen).toEqual([[1024, 4096]]);
  });
});
