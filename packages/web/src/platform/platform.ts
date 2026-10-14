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

export interface Platform {
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

export function getPlatform(): Platform {
  if (!current)
    throw new Error('No hay plataforma registrada: el cascarón (Electron o Android) debe registrarla al arrancar.');
  return current;
}
