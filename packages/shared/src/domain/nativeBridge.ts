// T115 · DT-19 y plan §10.1: el contrato entre la interfaz (renderizador) y el proceso principal de Electron. El
// preload expone solo `invoke` sobre estos canales y los eventos del WebSocket; todo lo nativo (red con verificación de
// la identidad, descubrimiento, almacenamiento seguro, SQLite cifrado, archivos, notificaciones) vive en el principal.

/** Los canales que el preload deja pasar; cualquier otro se rechaza. */
export const NATIVE_CHANNELS = [
  'http',
  'ws.open',
  'ws.send',
  'ws.close',
  'discovery.browse',
  'discovery.broadcast',
  'discovery.probe',
  'discovery.subnet',
  'secure.get',
  'secure.set',
  'secure.remove',
  'db.open',
  'db.execute',
  'db.query',
  'file.save',
  'notify',
  'secureScreen',
  'update.install',
] as const;
export type NativeChannel = (typeof NATIVE_CHANNELS)[number];

/** DT-18: el servidor que debe responder (el emparejado, o el anunciado mientras se empareja). */
export interface NativeServer {
  serverId: string;
  caFingerprint: string;
}

export interface NativeRequest {
  method: string;
  headers: Record<string, string>;
  /** El cuerpo ya serializado: JSON como texto, o los bytes de un multipart. */
  body: string | Uint8Array | null;
}

export interface NativeResponse {
  status: number;
  headers: [string, string][];
  body: Uint8Array | null;
}

export type NativeSocketEvent = 'open' | 'message' | 'close' | 'error';

export interface NativeDeviceInfo {
  platform: 'windows' | 'android';
  appVersion: string;
  smallestWidthDp: number;
  name: string;
}

/** Lo que ve la interfaz en `window.impocaribeNative`. */
export interface NativeBridge {
  /** Leída una vez al cargar: `platform.deviceInfo()` es síncrona. */
  info: NativeDeviceInfo;
  invoke(channel: NativeChannel, ...args: unknown[]): Promise<unknown>;
  /** Los eventos de los WebSocket abiertos con `ws.open`, por su número. */
  onSocket(listener: (id: number, event: NativeSocketEvent, data?: string) => void): void;
  /** T117: el avance de la descarga de una actualización (`update.install`). */
  onUpdateProgress(listener: (received: number, total: number) => void): void;
}

/**
 * T117 · RF-UPD-05: la versión que se instala. Solo eso: el servidor, la dirección y la huella los decide el proceso
 * principal con el emparejamiento guardado y la consulta al servidor verificado, no la interfaz.
 */
export interface NativeUpdate {
  version: string;
}
