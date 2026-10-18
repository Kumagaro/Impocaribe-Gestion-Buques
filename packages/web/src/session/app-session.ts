// T038 · Estado de la app: con qué servidor está emparejada (RF-RED-04), quién inició sesión (RF-AUT-02) y el cliente
// de API que firma cada petición con el dispositivo (DT-24). Lo sensible vive en el almacenamiento seguro (plan §9):
// nunca en la base local ni en el almacenamiento del navegador.
import type { UserDto } from '@impocaribe/shared/validation';
import { createApiClient } from '../api/client';
import { loadPairing, PAIRING_KEY, savePairing, type PairingRecord } from '../connection/pairing';
import { LocalStore } from '../local/local-store';
import type { Platform } from '../platform/platform';
import { SyncEngine } from '../sync/engine';
import type { ThemePreference } from '../ui/tokens';

export const SESSION_KEY = 'impocaribe.session';
export const PREFERENCES_KEY = 'impocaribe.preferences';

/** P-05 y RF-UI-06: preferencias de este dispositivo, no del usuario. */
export interface DevicePreferences {
  theme: ThemePreference;
  reduceMotion: boolean;
}
export const DEFAULT_PREFERENCES: DevicePreferences = { theme: 'system', reduceMotion: false };

export interface StoredSession {
  token: string;
  expiresAt: string;
  user: UserDto;
}

export type SessionStatus = 'loading' | 'unpaired' | 'signedOut' | 'signedIn';

export interface SessionState {
  status: SessionStatus;
  pairing: PairingRecord | null;
  session: StoredSession | null;
  preferences: DevicePreferences;
}

export class AppSession {
  private state: SessionState = { status: 'loading', pairing: null, session: null, preferences: DEFAULT_PREFERENCES };
  private readonly listeners = new Set<() => void>();
  // Promesas, no resultados: dos llamadas a la vez deben recibir la misma copia y el mismo motor.
  private store: Promise<LocalStore> | null = null;
  private engine: SyncEngine | null = null;

  constructor(
    private readonly platform: Platform,
    private readonly appVersion: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<Omit<SessionState, 'status'>>): void {
    const merged = { ...this.state, ...next };
    const status: SessionStatus = !merged.pairing ? 'unpaired' : merged.session ? 'signedIn' : 'signedOut';
    this.state = { ...merged, status };
    for (const listener of this.listeners) listener();
  }

  async load(): Promise<void> {
    const pairing = await loadPairing(this.platform.secureStorage);
    const raw = pairing ? await this.platform.secureStorage.get(SESSION_KEY) : null;
    const prefs = await this.platform.secureStorage.get(PREFERENCES_KEY);
    this.set({
      pairing,
      session: raw ? (JSON.parse(raw) as StoredSession) : null,
      preferences: { ...DEFAULT_PREFERENCES, ...(prefs ? (JSON.parse(prefs) as Partial<DevicePreferences>) : {}) },
    });
  }

  async paired(record: PairingRecord): Promise<void> {
    await savePairing(this.platform.secureStorage, record);
    this.set({ pairing: record, session: null });
  }

  async signedIn(session: StoredSession): Promise<void> {
    await this.platform.secureStorage.set(SESSION_KEY, JSON.stringify(session));
    this.set({ session });
  }

  /** RF-AUT-08: al cerrar sesión, o cuando el servidor la revoca, se borran la credencial y la copia local. */
  async signOut(): Promise<void> {
    this.engine?.stop();
    this.engine = null;
    await (await this.store)?.clear();
    await this.platform.secureStorage.remove(SESSION_KEY);
    this.set({ session: null });
  }

  /** RF-RED-05: un dispositivo revocado olvida también el emparejamiento; para volver a usarlo hay que emparejarlo. */
  async forgetDevice(): Promise<void> {
    await this.signOut();
    await this.platform.secureStorage.remove(PAIRING_KEY);
    this.set({ pairing: null });
  }

  /** La copia local de este dispositivo (T044). */
  localStore(): Promise<LocalStore> {
    this.store ??= LocalStore.open(this.platform);
    return this.store;
  }

  /** Con sesión: arranca la sincronización (T045). Una sola por sesión. */
  async startSync(): Promise<SyncEngine> {
    const store = await this.localStore();
    if (this.engine) return this.engine;
    // Sin await entre la comprobación y la asignación: una segunda llamada ya ve este motor.
    this.engine = new SyncEngine({
      store,
      api: () => this.api(),
      socket: (url) => this.platform.ws(url),
      wsUrl: () => {
        const { address, port } = this.state.pairing!.lastAddress!;
        return `${this.platform.serverScheme === 'http' ? 'ws' : 'wss'}://${address}:${port}/api/v1/ws`;
      },
      token: () => this.state.session?.token ?? null,
      now: this.clock,
      onRevoked: (kind) => void (kind === 'device' ? this.forgetDevice() : this.signOut()),
    });
    this.engine.start();
    return this.engine;
  }

  /** El motor de la sesión en curso, si ya arrancó. */
  syncEngine(): SyncEngine | null {
    return this.engine;
  }

  /** P-05: tema y "Reducir animaciones" de este dispositivo. */
  async setPreferences(change: Partial<DevicePreferences>): Promise<void> {
    const preferences = { ...this.state.preferences, ...change };
    await this.platform.secureStorage.set(PREFERENCES_KEY, JSON.stringify(preferences));
    this.set({ preferences });
  }

  /** Plataforma de este dispositivo (Windows o Android), para las sesiones (P-05). */
  deviceInfo() {
    return this.platform.deviceInfo();
  }

  /** RNF-09: bloquea las capturas mientras se muestran secretos, como los códigos de recuperación. */
  secureScreen(enabled: boolean): Promise<void> {
    return this.platform.secureScreen(enabled);
  }

  /** La plataforma: descubrimiento y cámara para emparejar (P-01). */
  get device(): Platform {
    return this.platform;
  }

  /** La hora de la app (la del servidor en las pruebas): cuenta atrás del código (P-01). */
  now(): Date {
    return this.clock();
  }

  /** Un cliente para un servidor aún sin emparejar, sin firma de dispositivo (descubrimiento y emparejamiento). */
  apiFor(address: string, port: number) {
    return this.client(address, port, async () => null);
  }

  /** El cliente de API del servidor emparejado, por su última dirección conocida. */
  api() {
    const pairing = this.state.pairing;
    if (!pairing?.lastAddress) throw new Error('Este dispositivo no está emparejado con el servidor.');
    const { address, port } = pairing.lastAddress;
    return this.client(address, port, async () => ({ id: pairing.deviceId, secret: pairing.deviceSecret }));
  }

  private client(address: string, port: number, getDevice: () => Promise<{ id: string; secret: string } | null>) {
    return createApiClient({
      baseUrl: `${this.platform.serverScheme ?? 'https'}://${address}:${port}/api/v1`,
      appVersion: this.appVersion,
      getToken: async () => this.state.session?.token ?? null,
      getDevice,
      now: this.clock,
      transport: this.platform.http,
      onSessionExpired: () => void this.signOut(),
      onDeviceRevoked: () => void this.forgetDevice(),
    });
  }
}
