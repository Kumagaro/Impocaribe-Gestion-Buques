// T019 · DT-03, plan §7.1 y Const. art. IX.3: lo único que la interfaz pide al sistema operativo. Cada cascarón
// (Electron, Android) registra su implementación al arrancar; las pruebas usan test-platform.ts.

export interface DeviceInfo {
  platform: 'windows' | 'android';
  appVersion: string;
  /** Ancho mínimo de la pantalla en dp: decide teléfono o tablet en Android (RF-UI-02). */
  smallestWidthDp: number;
}

export type SqlValue = string | number | null | Uint8Array;

export interface SqlExecutor {
  execute(sql: string, params?: SqlValue[]): Promise<void>;
  query<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

/** Base SQLite local (cifrada en las apps): la copia local y los borradores (Const. art. VII). */
export interface LocalDatabase extends SqlExecutor {
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Petición HTTP con la forma de fetch. En las apps verifica la identidad del servidor (DT-18, DT-19). */
export type HttpTransport = (url: string, init: RequestInit) => Promise<Response>;

/** Conexión WebSocket del transporte nativo (plan §6.4). */
export interface PlatformSocket {
  send(data: string): void;
  close(): void;
  on(event: 'open' | 'message' | 'close' | 'error', listener: (data?: string) => void): void;
}

/** Cómo se encontró al servidor (RF-RED-02): en este orden, y QR o dirección escrita como último recurso. */
export type DiscoveryMethod = 'last' | 'dnssd' | 'broadcast' | 'subnet' | 'manual' | 'qr';

/**
 * Lo que dice de sí un servidor encontrado (DT-20). No prueba nada: la identidad se verifica al conectar, con la cadena
 * del certificado (DT-18).
 */
export interface ServerAnnouncement {
  address: string;
  port: number;
  serverId: string;
  caFingerprint: string;
  version: string;
}

/** Descubrimiento en la red local (DT-20), nativo en cada cascarón (T115, T118). */
export interface PlatformDiscovery {
  /** DNS-SD `_impocaribe._tcp` durante `timeoutMs`. */
  browse(timeoutMs: number): Promise<ServerAnnouncement[]>;
  /** Difusión UDP al puerto 47800 durante `timeoutMs`. */
  broadcast(timeoutMs: number): Promise<ServerAnnouncement[]>;
  /** GET /discovery a una dirección (la última conocida, una de la subred o una escrita a mano). */
  probe(address: string, port: number, timeoutMs: number): Promise<ServerAnnouncement | null>;
  /** Las direcciones de la red local (/24) del dispositivo, para buscar una a una. */
  subnetAddresses(): Promise<string[]>;
}

export interface Platform {
  /** Todas las peticiones al servidor pasan por aquí, nunca por el fetch del WebView (DT-19). */
  http: HttpTransport;
  ws(url: string): PlatformSocket;
  discovery: PlatformDiscovery;
  deviceInfo(): DeviceInfo;
  /** Keystore en Android, safeStorage en Electron (plan §9). */
  secureStorage: SecureStorage;
  openDatabase(name: string): Promise<LocalDatabase>;
  saveFile(name: string, data: Uint8Array): Promise<void>;
  /** Notificación del sistema, sin datos sensibles (Const. art. X.6). */
  notify(notification: { title: string; body: string }): Promise<void>;
  /** Bloquea las capturas en pantallas sensibles (RNF-09). */
  secureScreen(enabled: boolean): Promise<void>;
  installUpdate(downloadUrl: string): Promise<void>;
}

let current: Platform | null = null;

export function setPlatform(platform: Platform | null): void {
  current = platform;
}

/** La plataforma registrada, o null en el navegador de pruebas. */
export function findPlatform(): Platform | null {
  return current;
}

export function getPlatform(): Platform {
  if (!current)
    throw new Error('No hay plataforma registrada: el cascarón (Electron o Android) debe registrarla al arrancar.');
  return current;
}
