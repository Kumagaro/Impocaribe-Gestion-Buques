// T038 · Estado de la app: con qué servidor está emparejada (RF-RED-04), quién inició sesión (RF-AUT-02) y el cliente
// de API que firma cada petición con el dispositivo (DT-24). Lo sensible vive en el almacenamiento seguro (plan §9):
// nunca en la base local ni en el almacenamiento del navegador.
import { ALERTS } from '@impocaribe/shared';
import type { UserDto } from '@impocaribe/shared/validation';
import { createApiClient } from '../api/client';
import { postDeviceToken } from '../api/endpoints/auth';
import { loadPairing, PAIRING_KEY, savePairing, type PairingRecord } from '../connection/pairing';
import { LocalStore } from '../local/local-store';
import type { ExpectedServer, Platform } from '../platform/platform';
import { SyncEngine } from '../sync/engine';
import type { ThemePreference } from '../ui/tokens';

export const SESSION_KEY = 'impocaribe.session';
export const PREFERENCES_KEY = 'impocaribe.preferences';

/** P-05 y RF-UI-06: preferencias de este dispositivo, no del usuario. */
export interface DevicePreferences {
  theme: ThemePreference;
  reduceMotion: boolean;
  /** T114 · RF-UPD-03: «Más tarde» oculta la banda de esa versión hasta esa hora (el día siguiente). */
  updateLater?: { version: string; until: string };
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
  /** RF-UPD-04: el servidor respondió 426; hasta actualizar, solo se ven los borradores locales (EST-07). */
  upgradeRequired: { appVersion: string; minVersion: string } | null;
}

export class AppSession {
  private state: SessionState = {
    status: 'loading',
    pairing: null,
    session: null,
    preferences: DEFAULT_PREFERENCES,
    upgradeRequired: null,
  };
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

  /** T114: esta app, para preguntar si hay una versión nueva (RF-UPD-02). */
  app(): { platform: 'windows' | 'android'; version: string; canInstall: boolean } {
    return {
      platform: this.platform.deviceInfo().platform,
      version: this.appVersion,
      canInstall: this.platform.installUpdate !== undefined,
    };
  }

  /** RF-UPD-05: descarga la versión del servidor emparejado y pide al sistema instalarla. */
  async installUpdate(
    update: { downloadUrl: string; version: string; sha256: string },
    onProgress?: (received: number, total: number) => void,
  ): Promise<void> {
    const address = this.state.pairing?.lastAddress;
    if (!this.platform.installUpdate || !address) throw new Error('Esta app no se puede actualizar desde aquí.');
    const url = `${this.platform.serverScheme ?? 'https'}://${address.address}:${address.port}${update.downloadUrl}`;
    await this.platform.installUpdate(
      { url, version: update.version, sha256: update.sha256, server: this.expected() },
      onProgress,
    );
  }

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
    void this.platform.alertService?.stop().catch(() => undefined);
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
      socket: (url) => this.platform.ws(url, this.expected()),
      wsUrl: () => {
        const { address, port } = this.state.pairing!.lastAddress!;
        return `${this.platform.serverScheme === 'http' ? 'ws' : 'wss'}://${address}:${port}/api/v1/ws`;
      },
      token: () => this.state.session?.token ?? null,
      now: this.clock,
      onRevoked: (kind) => void (kind === 'device' ? this.forgetDevice() : this.signOut()),
    });
    this.engine.start();
    void this.startAlerts();
    return this.engine;
  }

  /**
   * T119 · RF-ALR-01 y DT-05: en Android, el servicio que recibe las alertas con la app cerrada. Sigue con su token
   * mientras valga; solo si no tiene, se pide uno (pedirlo en cada arranque llenaría la bitácora).
   */
  private async startAlerts(): Promise<void> {
    const alerts = this.platform.alertService;
    if (!alerts) return;
    const labels = Object.fromEntries(Object.entries(ALERTS).map(([type, a]) => [type, a.label]));
    try {
      if (await alerts.start(labels)) return;
      const { token } = await this.api().request(postDeviceToken);
      await alerts.start(labels, token);
    } catch {
      // Sin servidor ahora: se vuelve a intentar en el próximo arranque; con la app abierta, se ven en el contador.
    }
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
  /** RF-ORD-22: «Guardar como» en escritorio; Descargas (y compartir) en Android. */
  saveFile(name: string, data: Uint8Array): Promise<void> {
    return this.platform.saveFile(name, data);
  }

  /** T098 · RF-ALR-02: notificación del sistema con la app abierta; solo el tipo y la referencia. */
  notify(notification: { title: string; body: string }): Promise<void> {
    return this.platform.notify(notification);
  }

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
  apiFor(address: string, port: number, server: ExpectedServer) {
    return this.client(address, port, async () => null, server);
  }

  /** DT-18: la identidad del servidor emparejado, la que el transporte nativo exige. */
  private expected(): ExpectedServer {
    const { serverId, caFingerprint } = this.state.pairing!;
    return { serverId, caFingerprint };
  }

  /** El cliente de API del servidor emparejado, por su última dirección conocida. */
  api() {
    const pairing = this.state.pairing;
    if (!pairing?.lastAddress) throw new Error('Este dispositivo no está emparejado con el servidor.');
    const { address, port } = pairing.lastAddress;
    return this.client(
      address,
      port,
      async () => ({ id: pairing.deviceId, secret: pairing.deviceSecret }),
      this.expected(),
    );
  }

  private client(
    address: string,
    port: number,
    getDevice: () => Promise<{ id: string; secret: string } | null>,
    server: ExpectedServer,
  ) {
    return createApiClient({
      baseUrl: `${this.platform.serverScheme ?? 'https'}://${address}:${port}/api/v1`,
      appVersion: this.appVersion,
      appPlatform: this.platform.deviceInfo().platform,
      getToken: async () => this.state.session?.token ?? null,
      getDevice,
      now: this.clock,
      transport: (url, init) => this.platform.http(url, init, server),
      onSessionExpired: () => void this.signOut(),
      onDeviceRevoked: () => void this.forgetDevice(),
      onUpgradeRequired: (details) =>
        this.set({
          upgradeRequired: {
            appVersion: String(details?.appVersion ?? this.appVersion),
            minVersion: String(details?.minVersion ?? ''),
          },
        }),
    });
  }
}
