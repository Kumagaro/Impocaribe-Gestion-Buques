// T115 · plan §10.1: cada canal del puente (NATIVE_CHANNELS) con su servicio del proceso principal. Los argumentos
// llegan del renderizador: se comprueban aquí, no se confía en ellos.
import type { NativeChannel, NativeRequest, NativeServer, NativeUpdate } from '@impocaribe/shared';
import type { LocalDatabases, SqlValue } from './database.ts';
import type { Announcement } from './discovery.ts';
import type { SecureStore } from './secure-storage.ts';
import type { NativeTransport } from './transport.ts';

export interface NativeServices {
  transport: NativeTransport;
  secure: SecureStore;
  databases: LocalDatabases;
  discovery: {
    browse(timeoutMs: number): Promise<Announcement[]>;
    broadcast(timeoutMs: number): Promise<Announcement[]>;
    probe(address: string, port: number, timeoutMs: number): Promise<Announcement | null>;
    subnet(): string[];
  };
  saveFile(name: string, data: Uint8Array): Promise<void>;
  notify(title: string, body: string): void;
  secureScreen(enabled: boolean): void;
  /** T117: descarga, comprueba e instala la versión (la app se cierra para instalarla). */
  installUpdate(update: NativeUpdate, server: NativeServer): Promise<void>;
}

type Handler = (...args: unknown[]) => unknown;

const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string') throw new Error(`Falta ${what}.`);
  return v;
};
const num = (v: unknown, what: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Falta ${what}.`);
  return v;
};
const server = (v: unknown): NativeServer | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = v as Partial<NativeServer>;
  return { serverId: str(s.serverId, 'la identidad del servidor'), caFingerprint: str(s.caFingerprint, 'la huella') };
};
const params = (v: unknown): SqlValue[] => (Array.isArray(v) ? (v as SqlValue[]) : []);

/** Los manejadores por canal; `handle` es `ipcMain.handle` (o el de una prueba). */
export function nativeHandlers(s: NativeServices): Record<NativeChannel, Handler> {
  return {
    http: (url, init, srv) => s.transport.http(str(url, 'la dirección'), init as NativeRequest, server(srv)),
    'ws.open': (url, srv) => s.transport.open(str(url, 'la dirección'), server(srv)),
    'ws.send': (id, data) => s.transport.send(num(id, 'el socket'), str(data, 'el mensaje')),
    'ws.close': (id) => s.transport.close(num(id, 'el socket')),
    'discovery.browse': (ms) => s.discovery.browse(num(ms, 'el plazo')),
    'discovery.broadcast': (ms) => s.discovery.broadcast(num(ms, 'el plazo')),
    'discovery.probe': (address, port, ms) =>
      s.discovery.probe(str(address, 'la dirección'), num(port, 'el puerto'), num(ms, 'el plazo')),
    'discovery.subnet': () => s.discovery.subnet(),
    'secure.get': (key) => s.secure.get(str(key, 'la clave')),
    'secure.set': (key, value) => s.secure.set(str(key, 'la clave'), str(value, 'el valor')),
    'secure.remove': (key) => s.secure.remove(str(key, 'la clave')),
    'db.open': (name) => s.databases.openDatabase(str(name, 'el nombre de la base')),
    'db.execute': (id, sql, p) => s.databases.execute(num(id, 'la base'), str(sql, 'la sentencia'), params(p)),
    'db.query': (id, sql, p) => s.databases.query(num(id, 'la base'), str(sql, 'la consulta'), params(p)),
    'file.save': (name, data) => {
      if (!(data instanceof Uint8Array)) throw new Error('Falta el contenido del archivo.');
      return s.saveFile(str(name, 'el nombre'), data);
    },
    notify: (n) => {
      const { title, body } = n as { title: unknown; body: unknown };
      s.notify(str(title, 'el título'), str(body, 'el texto'));
    },
    secureScreen: (enabled) => s.secureScreen(enabled === true),
    'update.install': (u, srv) => {
      const update = u as Partial<NativeUpdate>;
      const expected = server(srv);
      if (!expected) throw new Error('Falta la identidad del servidor.');
      return s.installUpdate(
        {
          url: str(update.url, 'la dirección'),
          version: str(update.version, 'la versión'),
          sha256: str(update.sha256, 'la huella'),
        },
        expected,
      );
    },
  };
}

/** Registra cada canal como `native:<canal>`. */
export function registerNative(
  handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => void,
  services: NativeServices,
): void {
  for (const [channel, fn] of Object.entries(nativeHandlers(services)))
    handle(`native:${channel}`, (_event, ...args) => fn(...args));
}
