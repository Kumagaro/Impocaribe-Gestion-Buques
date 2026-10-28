// T115 · plan §10.1: cada canal del puente (NATIVE_CHANNELS) con su servicio del proceso principal. Los argumentos
// llegan del renderizador: se comprueban aquí, no se confía en ellos.
import type {
  NativeChannel,
  NativeRequest,
  NativeServer,
  NativeUpdate,
  PcFacts,
  SetupOperation,
  SetupOutcome,
  SetupRequest,
} from '@impocaribe/shared';
import type { SetupState } from '../system/setup.ts';
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
  installUpdate(update: NativeUpdate): Promise<void>;
  /** T127: el ayudante de instalación (P-28); null si la app no la puso el instalador completo. */
  setup: {
    facts(): Promise<PcFacts>;
    checkCode(code: string): Promise<boolean>;
    run(operation: SetupOperation, request: SetupRequest): Promise<SetupOutcome>;
    current(): SetupState;
  } | null;
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

const OPERATIONS: readonly SetupOperation[] = ['crear', 'reparar', 'deshacer', 'restablecer'];
/** Solo los campos conocidos, como texto; el ayudante vuelve a validarlos. */
const setupRequest = (v: unknown): SetupRequest => {
  const r = (v ?? {}) as Record<string, unknown>;
  const out: SetupRequest = {};
  if (r.network !== undefined) {
    if (r.network !== 'router' && r.network !== 'hotspot') throw new Error('Montaje de red desconocido.');
    out.network = r.network;
  }
  for (const key of ['code', 'username', 'password'] as const)
    if (r[key] !== undefined)
      out[key] = str(r[key], key === 'code' ? 'el código' : key === 'username' ? 'el usuario' : 'la contraseña');
  return out;
};
const setup = (s: NativeServices) => {
  if (!s.setup) throw new Error('Esta app no la puso el instalador completo: no puede crear el servidor.');
  return s.setup;
};

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
    'update.install': (u) => s.installUpdate({ version: str((u as Partial<NativeUpdate>)?.version, 'la versión') }),
    // T118: solo Android lee el QR de emparejamiento con la cámara (P-01); en la PC no se ofrece.
    'qr.scan': () => {
      throw new Error('Este equipo no lee códigos QR.');
    },
    // T119: el servicio de alertas es de Android; en la PC las alertas siguen llegando desde la bandeja (T116).
    'alerts.start': () => {
      throw new Error('En este equipo las alertas llegan desde la bandeja.');
    },
    'alerts.stop': () => undefined,
    // T127 · P-28: el ayudante de instalación, solo con el instalador completo.
    'setup.facts': () => setup(s).facts(),
    'setup.code': (code) => setup(s).checkCode(str(code, 'el código')),
    'setup.run': (operation, request) => {
      if (!OPERATIONS.includes(operation as SetupOperation)) throw new Error('Operación desconocida.');
      return setup(s).run(operation as SetupOperation, setupRequest(request));
    },
    'setup.state': () => s.setup?.current() ?? { running: false, operation: null, messages: [] },
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
