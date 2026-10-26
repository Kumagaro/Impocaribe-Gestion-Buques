// T019 · DT-03, plan §7.1 y Const. art. IX.3: lo único que la interfaz pide al sistema operativo. Cada cascarón
// (Electron, Android) registra su implementación al arrancar; las pruebas usan test-platform.ts.

export interface DeviceInfo {
  platform: 'windows' | 'android';
  appVersion: string;
  /** Ancho mínimo de la pantalla en dp: decide teléfono o tablet en Android (RF-UI-02). */
  smallestWidthDp: number;
  /** Nombre del equipo o modelo del teléfono: propone el nombre del dispositivo al emparejarlo (P-01). */
  name?: string;
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
export type HttpTransport = (url: string, init: RequestInit, server?: ExpectedServer) => Promise<Response>;

/**
 * T115 · DT-18: el servidor que debe responder: el emparejado, o el anunciado mientras se empareja. El transporte nativo
 * solo entrega la petición si la cadena del certificado es la de esa identidad; el navegador de pruebas no lo comprueba.
 */
export interface ExpectedServer {
  serverId: string;
  caFingerprint: string;
}

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
  /**
   * RF-RED-06: el estado de la red del dispositivo, para explicar por qué no se encuentra el servidor. Lo implementan
   * los cascarones (T115, T118); sin él, o con null (no se sabe), el diagnóstico no distingue un servidor apagado de una
   * red que aísla equipos.
   */
  lan?(): Promise<LanStatus | null>;
}

/** Clave de sessionStorage con el estado de red que simula una prueba de extremo a extremo (browser-platform). */
export const SIMULATED_LAN_KEY = 'impocaribe.e2e.lan';

export interface LanStatus {
  /** Nombre de la red wifi, si el sistema lo da. */
  wifi: string | null;
  /** El router (puerta de enlace) responde: hay red. */
  gatewayReachable: boolean;
  /** Se ven otros equipos de la red: si no, el router aísla a los clientes (AP isolation). */
  peersVisible: boolean;
}

/** T114: el instalador publicado en el servidor (T113). */
export interface UpdatePackage {
  /** Dirección completa de la descarga en el servidor emparejado. */
  url: string;
  version: string;
  sha256: string;
  /** DT-18: se descarga del servidor emparejado, con la identidad verificada. */
  server: ExpectedServer;
}

export interface Platform {
  /** Cómo se habla con el servidor: https en las apps (DT-18); http solo en el navegador de pruebas. */
  serverScheme?: 'http' | 'https';
  /** Todas las peticiones al servidor pasan por aquí, nunca por el fetch del WebView (DT-19). */
  http: HttpTransport;
  ws(url: string, server?: ExpectedServer): PlatformSocket;
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
  /** Lee un QR con la cámara (TEL y TAB, P-01); null si se cancela. Sin cámara, no existe. */
  scanQr?(): Promise<string | null>;
  /**
   * RF-UPD-05: descarga la versión del servidor local (por el transporte nativo, DT-19), comprueba su huella y pide al
   * sistema instalarla, con la confirmación del usuario. El navegador de pruebas no la tiene.
   */
  installUpdate?(update: UpdatePackage, onProgress?: (received: number, total: number) => void): Promise<void>;
  /**
   * RF-ALR-01 y DT-05: el servicio de Android que recibe las alertas con la app cerrada. `start` responde false
   * si no tiene token: entonces se le pasa uno nuevo. Solo existe en Android (en la PC, la bandeja).
   */
  alertService?: {
    start(labels: Record<string, string>, token?: string): Promise<boolean>;
    stop(): Promise<void>;
  };
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
