// T045 · plan §5.9 y §6.4: el motor de sincronización. Mantiene la copia local al día con lo que confirma el servidor
// (Const. art. VII): instantánea la primera vez o con otra época, cambios incrementales con cada aviso del WebSocket,
// al reconectar y cada 60 s. Nunca escribe en la copia nada que el servidor no haya publicado.
import {
  wsServerMessageSchema,
  type syncSnapshotResponseSchema,
  type SyncChange,
  type SyncEntity,
} from '@impocaribe/shared/validation';
import type { z } from 'zod';
import { ApiError, type createApiClient } from '../api/client';
import { getSyncChanges, getSyncSnapshot, getSyncState } from '../api/endpoints/sync';
import type { LocalStore } from '../local/local-store';
import type { PlatformSocket } from '../platform/platform';

type Api = ReturnType<typeof createApiClient>;
type SnapshotPage = z.infer<typeof syncSnapshotResponseSchema>;

/** Plan §5.9: sin avisos, se pregunta igual cada 60 s. */
export const POLL_MS = 60_000;
/** Plan §6.4: reconexión con espera exponencial, de 1 s hasta 30 s. */
export const RECONNECT_FIRST_MS = 1000;
export const RECONNECT_MAX_MS = 30_000;
/** Plan §5.9: la copia guarda 12 meses de lo inactivo. */
const KEEP_MONTHS = 12;
const CHANGES_PAGE = 500;

export interface SyncStatus {
  /** idle: aún no empezó · downloading: primera descarga o reconstrucción · ready: al día. */
  stage: 'idle' | 'downloading' | 'ready';
  /** La última consulta al servidor respondió. */
  online: boolean;
  /** Hora del servidor de la última sincronización completa: "datos al {fecha y hora}" (RF-CON-05). */
  syncedAt: string | null;
  /** Hay copia local que mostrar, aunque no haya conexión. */
  hasData: boolean;
  /** Registros recibidos en la descarga en curso (pantalla de progreso, RNF-20). */
  received: number;
  /** Hora del dispositivo − hora del servidor, medida en la última sincronización (RF-CON-10). */
  clockSkewMs: number | null;
  /** Hay una sincronización en curso (indicador que gira, MOV-08). */
  syncing: boolean;
}

/** Lo que cambió en una sincronización, para que las pantallas vuelvan a leer y resalten las filas (MOV-02). */
export interface SyncChanged {
  entities: SyncEntity[];
  ids: string[];
}

export interface SyncDeps {
  store: LocalStore;
  api(): Api;
  socket(url: string): PlatformSocket;
  wsUrl(): string;
  token(): string | null;
  now(): Date;
  /** El servidor cerró esta sesión o revocó el dispositivo: borrar credencial y copia (RF-AUT-08). */
  onRevoked(kind: 'session' | 'device'): void;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** El aviso inmediato de una alerta (RF-ALR-02: tipo y referencia). */
export interface AlertNotice {
  id: string;
  type: string;
  title: string;
}

export class SyncEngine {
  private current: SyncStatus = {
    stage: 'idle',
    online: false,
    syncedAt: null,
    hasData: false,
    received: 0,
    clockSkewMs: null,
    syncing: false,
  };
  private readonly statusListeners = new Set<() => void>();
  private readonly changeListeners = new Set<(c: SyncChanged) => void>();
  private readonly alertListeners = new Set<(a: AlertNotice) => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private socket: PlatformSocket | null = null;
  private reconnectMs = RECONNECT_FIRST_MS;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private poller: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  private prunedOn: string | null = null;

  constructor(private readonly deps: SyncDeps) {}

  status = (): SyncStatus => this.current;

  subscribe = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  onChange(listener: (c: SyncChanged) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** RF-ALR-01: cada alerta nueva que ve esta sesión, en cuanto el servidor avisa (su detalle llega sincronizando). */
  onAlert(listener: (a: AlertNotice) => void): () => void {
    this.alertListeners.add(listener);
    return () => this.alertListeners.delete(listener);
  }

  /** Arranca: sincroniza, abre el WebSocket y pregunta cada 60 s. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.syncNow();
    this.connect();
    this.poller = setInterval(() => void this.syncNow(), POLL_MS);
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.poller) clearInterval(this.poller);
    this.poller = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  /** Sincroniza ya. Si ya hay una en curso, se hace otra al terminar (el aviso pudo llegar a mitad). */
  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      this.set({ syncing: true });
      do {
        this.again = false;
        await this.pull();
      } while (this.again);
    })().finally(() => {
      this.running = null;
      this.set({ syncing: false });
    });
    return this.running;
  }

  /** Plan §5.9: tras una escritura propia, espera a que la copia llegue a su `syncSeq` antes de mostrar el resultado. */
  async waitFor(seq: number): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (((await this.deps.store.seq()) ?? -1) >= seq) return;
      await this.syncNow();
    }
  }

  private async pull(): Promise<void> {
    const { store } = this.deps;
    const meta = await store.meta();
    this.set({ hasData: meta.seq !== null, syncedAt: meta.syncedAt, clockSkewMs: meta.skewMs });
    let state;
    try {
      state = await this.deps.api().request(getSyncState);
    } catch (err) {
      return this.offline(err);
    }
    const skewMs = this.deps.now().getTime() - Date.parse(state.serverTime);
    this.set({ online: true, clockSkewMs: skewMs });
    try {
      // RF-CON-09: sin copia, con otra época (restauración) o con otro formato de datos, se reconstruye.
      const fresh = meta.seq === null || meta.epoch !== state.epoch || meta.schemaVersion !== state.schemaVersion;
      if (fresh) await this.snapshot(state.schemaVersion);
      else await this.changesSince(meta.seq!);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'RESYNC_REQUIRED')) return this.offline(err);
      await this.snapshot(state.schemaVersion).catch((e: unknown) => this.offline(e));
      if (!this.current.online) return;
    }
    await store.setMeta({ syncedAt: state.serverTime, skewMs });
    await this.prune(state.serverTime);
    this.set({ stage: 'ready', syncedAt: state.serverTime, hasData: true });
  }

  /** RF-CON-02 y 09: borra la copia y descarga la instantánea; luego, lo que cambió mientras tanto. */
  private async snapshot(schemaVersion: number): Promise<void> {
    const { store } = this.deps;
    this.set({ stage: 'downloading', received: 0 });
    const records: (Omit<SyncChange, 'seq'> & { seq: number })[] = [];
    let cursor: string | null = null;
    let first: { epoch: string; seq: number } | null = null;
    do {
      const page: SnapshotPage = await this.deps.api().request(getSyncSnapshot, cursor ? { query: { cursor } } : {});
      first ??= { epoch: page.epoch, seq: page.seq };
      records.push(...page.records.map((r) => ({ ...r, op: 'upsert' as const, seq: first!.seq })));
      this.set({ received: records.length });
      cursor = page.nextCursor;
    } while (cursor);
    // Plan §5.9: todo dentro de una transacción local; si la descarga se corta, la copia vieja sigue entera.
    await store.replace(records, first!.seq, { epoch: first!.epoch, schemaVersion });
    this.emit(records);
    await this.changesSince(first!.seq);
  }

  private async changesSince(since: number): Promise<void> {
    let from = since;
    for (;;) {
      const page = await this.deps.api().request(getSyncChanges, {
        query: { since: String(from), limit: String(CHANGES_PAGE) },
      });
      await this.deps.store.apply(page.changes, page.nextSince);
      this.emit(page.changes);
      from = page.nextSince;
      if (!page.hasMore) return;
    }
  }

  /** Plan §5.9, "cada día": lo inactivo con más de 12 meses sale de la copia (se consulta en el archivo, RF-CON-07). */
  private async prune(serverTime: string): Promise<void> {
    const today = serverTime.slice(0, 10);
    if (this.prunedOn === today) return;
    const cutoff = new Date(serverTime);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - KEEP_MONTHS);
    await this.deps.store.prune(isoDate(cutoff));
    this.prunedOn = today;
  }

  private offline(err: unknown): void {
    if (!(err instanceof ApiError)) throw err;
    // Un fallo de red deja la copia como estaba: la app sigue mostrándola con la banda de conexión (RF-CON-05).
    if (err.code === 'OFFLINE' || err.status >= 500)
      this.set({ online: false, stage: this.current.hasData ? 'ready' : this.current.stage });
    // Sesión vencida o dispositivo revocado: el cliente de la API ya avisó a la sesión, que detiene este motor.
  }

  private emit(changes: { entityType: SyncEntity; entityId: string }[]): void {
    if (changes.length === 0) return;
    const event: SyncChanged = {
      entities: [...new Set(changes.map((c) => c.entityType))],
      ids: [...new Set(changes.map((c) => c.entityId))],
    };
    for (const l of this.changeListeners) l(event);
  }

  private set(change: Partial<SyncStatus>): void {
    this.current = { ...this.current, ...change };
    for (const l of this.statusListeners) l();
  }

  // ---------- WebSocket (plan §6.4) ----------

  private connect(): void {
    if (this.stopped) return;
    const token = this.deps.token();
    if (!token) return;
    const socket = this.deps.socket(this.deps.wsUrl());
    this.socket = socket;
    socket.on('open', () => socket.send(JSON.stringify({ type: 'auth', token })));
    socket.on('message', (data) => this.handle(data ?? ''));
    socket.on('close', () => this.reconnect(socket));
    socket.on('error', () => undefined);
  }

  private handle(data: string): void {
    let parsed;
    try {
      parsed = wsServerMessageSchema.safeParse(JSON.parse(data));
    } catch {
      return;
    }
    if (!parsed.success) return;
    const msg = parsed.data;
    if (msg.type === 'ready') {
      this.reconnectMs = RECONNECT_FIRST_MS;
      void this.syncNow();
    } else if (msg.type === 'sync.available' || msg.type === 'sync.epoch_changed') void this.syncNow();
    else if (msg.type === 'alert.created')
      for (const l of this.alertListeners) l({ id: msg.id, type: msg.alertType, title: msg.title });
    else if (msg.type === 'session.revoked') this.revoked('session');
    else if (msg.type === 'device.revoked') this.revoked('device');
  }

  private revoked(kind: 'session' | 'device'): void {
    this.stop();
    this.deps.onRevoked(kind);
  }

  private reconnect(socket: PlatformSocket): void {
    if (this.stopped || this.socket !== socket) return;
    this.socket = null;
    const wait = this.reconnectMs;
    this.reconnectMs = Math.min(this.reconnectMs * 2, RECONNECT_MAX_MS);
    this.timers.push(setTimeout(() => this.connect(), wait));
  }
}
