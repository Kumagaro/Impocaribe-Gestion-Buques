// T115 y T118 · DT-03, DT-19 y plan §10.1-10.2: la plataforma de las dos apps. Todo lo nativo lo hace su parte nativa
// por el mismo puente (NATIVE_CHANNELS): en Electron, el proceso principal por el preload (`window.impocaribeNative`);
// en Android, el plugin ImpocaribeNative (capacitor-bridge.ts). La red con la identidad del servidor verificada, el
// descubrimiento, el almacenamiento seguro y la copia local en SQLCipher.
import type {
  NativeBridge,
  NativeResponse,
  NativeSocketEvent,
  MoveFileInfo,
  PcFacts,
  SetupMessage,
  SetupOperation,
  SetupOutcome,
  SetupRequest,
} from '@impocaribe/shared';
import type { LocalDatabase, Platform, PlatformSocket, ServerAnnouncement, SqlExecutor, SqlValue } from './platform';

type Listener = (data?: string) => void;

/** El puente que expone el preload, si la app corre dentro de Electron. */
export function nativeBridge(): NativeBridge | null {
  return (globalThis as { impocaribeNative?: NativeBridge }).impocaribeNative ?? null;
}

/** Un multipart se serializa aquí (el IPC no lleva FormData) con su límite en el Content-Type. */
async function serialize(
  init: RequestInit,
): Promise<{ headers: Record<string, string>; body: string | Uint8Array | null }> {
  const headers = { ...(init.headers as Record<string, string> | undefined) };
  if (init.body instanceof FormData) {
    const req = new Request('https://impocaribe.local/', { method: 'POST', body: init.body });
    headers['Content-Type'] = req.headers.get('content-type')!;
    return { headers, body: new Uint8Array(await req.arrayBuffer()) };
  }
  return { headers, body: typeof init.body === 'string' ? init.body : null };
}

export function createNativePlatform(bridge: NativeBridge): Platform {
  const invoke = <T>(channel: Parameters<NativeBridge['invoke']>[0], ...args: unknown[]) =>
    bridge.invoke(channel, ...args) as Promise<T>;

  // WebSocket: los eventos llegan por número; los que llegan antes de saber el número se guardan hasta entonces.
  const sockets = new Map<number, Map<NativeSocketEvent, Set<Listener>>>();
  const early = new Map<number, [NativeSocketEvent, string | undefined][]>();
  bridge.onSocket((id, event, data) => {
    const own = sockets.get(id);
    if (own) for (const l of own.get(event) ?? []) l(data);
    else early.set(id, [...(early.get(id) ?? []), [event, data]]);
    if (event === 'close') sockets.delete(id);
  });

  return {
    // DT-18: siempre https; http solo si la parte nativa es una compilación de prueba contra un servidor sin TLS.
    serverScheme: bridge.info.plainHttp ? 'http' : 'https',
    http: async (url, init, server) => {
      const { headers, body } = await serialize(init);
      const res = await invoke<NativeResponse>('http', url, { method: init.method ?? 'GET', headers, body }, server);
      return new Response(res.body as BodyInit | null, { status: res.status, headers: res.headers });
    },
    ws: (url, server): PlatformSocket => {
      const listeners = new Map<NativeSocketEvent, Set<Listener>>();
      let id: number | null = null;
      let closed = false;
      const queued: string[] = [];
      const fire = (event: NativeSocketEvent, data?: string) => {
        for (const l of listeners.get(event) ?? []) l(data);
      };
      invoke<number>('ws.open', url, server).then(
        (n) => {
          id = n;
          sockets.set(n, listeners);
          for (const [event, data] of early.get(n) ?? []) fire(event, data);
          early.delete(n);
          for (const m of queued.splice(0)) void invoke('ws.send', n, m);
          if (closed) void invoke('ws.close', n);
        },
        (err: unknown) => {
          fire('error', err instanceof Error ? err.message : String(err));
          fire('close');
        },
      );
      return {
        send: (data) => (id === null ? queued.push(data) : void invoke('ws.send', id, data)),
        close: () => {
          closed = true;
          if (id !== null) void invoke('ws.close', id);
        },
        on: (event, listener) => {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(listener);
        },
      };
    },
    discovery: {
      browse: (ms) => invoke<ServerAnnouncement[]>('discovery.browse', ms),
      broadcast: (ms) => invoke<ServerAnnouncement[]>('discovery.broadcast', ms),
      probe: (address, port, ms) => invoke<ServerAnnouncement | null>('discovery.probe', address, port, ms),
      subnetAddresses: () => invoke<string[]>('discovery.subnet'),
    },
    deviceInfo: () => bridge.info,
    secureStorage: {
      get: (key) => invoke<string | null>('secure.get', key),
      set: (key, value) => invoke<void>('secure.set', key, value),
      remove: (key) => invoke<void>('secure.remove', key),
    },
    openDatabase: async (name): Promise<LocalDatabase> => {
      const db = await invoke<number>('db.open', name);
      const direct: SqlExecutor = {
        execute: (sql, params = []) => invoke<void>('db.execute', db, sql, params),
        query: <T>(sql: string, params: SqlValue[] = []) => invoke<T[]>('db.query', db, sql, params),
      };
      // Una transacción a la vez y nada intercalado: lo que llega durante una espera a que termine.
      let chain: Promise<unknown> = Promise.resolve();
      const queue = <T>(fn: () => Promise<T>): Promise<T> => {
        const run = chain.then(fn);
        chain = run.catch(() => undefined);
        return run;
      };
      return {
        execute: (sql, params) => queue(() => direct.execute(sql, params)),
        query: <T>(sql: string, params?: SqlValue[]) => queue(() => direct.query<T>(sql, params)),
        transaction: <T>(fn: (tx: SqlExecutor) => Promise<T>) =>
          queue(async () => {
            await direct.execute('BEGIN IMMEDIATE');
            try {
              const result = await fn(direct);
              await direct.execute('COMMIT');
              return result;
            } catch (err) {
              await direct.execute('ROLLBACK');
              throw err;
            }
          }),
      };
    },
    // T118 · P-01: el QR de emparejamiento con la cámara, solo en Android (la PC no lo ofrece).
    ...(bridge.info.platform === 'android'
      ? {
          scanQr: () => invoke<string | null>('qr.scan'),
          // R-01: la exclusión del ahorro de batería, que el servicio de alertas necesita.
          batteryExclusion: {
            excluded: () => invoke<boolean>('battery.status'),
            request: () => invoke<void>('battery.exclude'),
          },
          // T119: el servicio de alertas (con la app cerrada, RF-ALR-01).
          alertService: {
            start: (labels: Record<string, string>, token?: string) =>
              invoke<boolean>('alerts.start', labels, ...(token ? [token] : [])),
            stop: () => invoke<void>('alerts.stop'),
          },
        }
      : {}),
    ...(bridge.info.platform === 'windows'
      ? {
          attention: () => invoke<void>('window.attention'),
          reportServerPc: (devices: number | null) => invoke<void>('server.devices', devices),
        }
      : {}),
    // T127 · P-28: el ayudante de instalación, solo si la app la puso el instalador completo.
    ...(bridge.info.serverInstaller
      ? {
          serverSetup: {
            bundleVersion: bridge.info.serverBundleVersion ?? null,
            facts: () => invoke<PcFacts>('setup.facts'),
            checkCode: (code: string) => invoke<boolean>('setup.code', code),
            run: (operation: SetupOperation, request: SetupRequest) =>
              invoke<SetupOutcome>('setup.run', operation, request),
            state: () =>
              invoke<{ running: boolean; operation: SetupOperation | null; messages: SetupMessage[] }>('setup.state'),
            listen: (listener: (message: SetupMessage) => void) => bridge.onSetupMessage(listener),
            readMove: (file: string, password: string) => invoke<MoveFileInfo>('setup.move', file, password),
            pickFile: () => invoke<string | null>('setup.pickFile'),
            pickFolder: () => invoke<string | null>('setup.pickFolder'),
          },
        }
      : {}),
    saveFile: (name, data) => invoke<void>('file.save', name, data),
    notify: (n) => invoke<void>('notify', n),
    secureScreen: (enabled) => invoke<void>('secureScreen', enabled),
    // T117 · RF-UPD-05: solo la versión. El proceso principal toma el servidor del emparejamiento guardado, le pide la
    // huella, descarga, la comprueba y abre el instalador (y la app se cierra).
    installUpdate: ({ version }, onProgress) => {
      bridge.onUpdateProgress(onProgress ?? (() => undefined));
      return invoke<void>('update.install', { version });
    },
  };
}
