// T038 · Estado de la app: con qué servidor está emparejada (RF-RED-04), quién inició sesión (RF-AUT-02) y el cliente
// de API que firma cada petición con el dispositivo (DT-24). Lo sensible vive en el almacenamiento seguro (plan §9):
// nunca en la base local ni en el almacenamiento del navegador.
import type { UserDto } from '@impocaribe/shared/validation';
import { createApiClient } from '../api/client';
import { loadPairing, savePairing, type PairingRecord } from '../connection/pairing';
import type { Platform } from '../platform/platform';
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

  /** RF-AUT-08: borra la credencial. La copia local se borra con ella cuando exista (F2). */
  async signOut(): Promise<void> {
    await this.platform.secureStorage.remove(SESSION_KEY);
    this.set({ session: null });
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
    });
  }
}
