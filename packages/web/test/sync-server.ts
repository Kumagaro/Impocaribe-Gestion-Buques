// T045 · Servidor de sincronización simulado para probar el motor (plan §5.9 y §6.2): un registro de cambios con
// audiencias, época, depuración e instantánea paginada, con las mismas respuestas que el real (esquemas compartidos).
// Puede fallar a voluntad para simular cortes de red. Lo que se prueba es el motor, no esto.
import type { SyncEntity } from '@impocaribe/shared/validation';
import type { HttpTransport, PlatformSocket } from '../src/platform/platform';

type Role = 'apoderada' | 'operador' | 'lectura';
interface LogEntry {
  seq: number;
  entityType: SyncEntity;
  entityId: string;
  op: 'upsert' | 'delete';
  audience: string;
  payload: unknown;
  refDate: string | null;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function audiencesFor(role: Role, userId: string): string[] {
  return [
    'all',
    ...(role === 'lectura' ? [] : ['editors']),
    ...(role === 'apoderada' ? ['apoderada'] : []),
    `user:${userId}`,
  ];
}

export function createSyncServer(options: { role?: Role; userId?: string; pageSize?: number } = {}) {
  const role = options.role ?? 'operador';
  const userId = options.userId ?? '0199f0a1-0000-7000-8000-0000000000aa';
  const pageSize = options.pageSize ?? 2000;
  const server = {
    epoch: '0199f0a1-0000-7000-8000-0000000000e1',
    schemaVersion: 1,
    serverTime: '2026-10-14T16:40:00.000Z',
    log: [] as LogEntry[],
    /** El estado actual de cada entidad, por audiencia: lo que debe quedar en una copia al día. */
    current: new Map<string, LogEntry>(),
    /** Cambios con número ≤ purgedThrough ya se depuraron. */
    purgedThrough: 0,
    /** Probabilidad de que una petición falle como si se cayera la red (0 a 1). */
    failRate: 0,
    random: Math.random,
    calls: [] as string[],
    sockets: [] as SimulatedSocket[],
    /** Cuándo se intentó abrir cada WebSocket (ms de Date.now()). */
    attempts: [] as number[],
    /** El servidor no acepta conexiones WebSocket: cada intento se cierra sin abrirse. */
    refuse: false,

    lastSeq: () => server.log.at(-1)?.seq ?? server.purgedThrough,

    /** Una escritura confirmada en el servidor: registra el cambio y avisa a los sockets abiertos. */
    write(change: Omit<LogEntry, 'seq'>): number {
      const entry = { ...change, seq: server.lastSeq() + 1 };
      server.log.push(entry);
      const key = `${entry.entityType}:${entry.entityId}`;
      if (entry.op === 'delete') server.current.delete(key);
      else server.current.set(key, entry);
      for (const s of server.sockets) s.receive({ type: 'sync.available', seq: entry.seq });
      return entry.seq;
    },

    /** Restaurar un respaldo: otra época, la copia de cada app se reconstruye (RF-CON-09). */
    newEpoch(epoch: string): void {
      server.epoch = epoch;
      for (const s of server.sockets) s.receive({ type: 'sync.epoch_changed' });
    },

    purge(through: number): void {
      server.log = server.log.filter((e) => e.seq > through);
      server.purgedThrough = Math.max(server.purgedThrough, through);
    },

    /** Lo que la copia de este rol debe tener al final: entidad → id → payload. */
    expected(): Record<string, Record<string, unknown>> {
      const out: Record<string, Record<string, unknown>> = {};
      const seen = audiencesFor(role, userId);
      for (const e of server.current.values())
        if (seen.includes(e.audience)) (out[e.entityType] ??= {})[e.entityId] = e.payload;
      return out;
    },

    transport: (async (url) => {
      const u = new URL(url);
      const path = u.pathname.replace(/^.*\/api\/v1/, '');
      server.calls.push(path + u.search);
      if (server.failRate > 0 && server.random() < server.failRate) throw new TypeError('Failed to fetch');
      const seen = audiencesFor(role, userId);
      if (path === '/sync/state')
        return json(200, {
          epoch: server.epoch,
          lastSeq: server.lastSeq(),
          schemaVersion: server.schemaVersion,
          serverTime: server.serverTime,
        });
      if (path === '/sync/changes') {
        const since = Number(u.searchParams.get('since'));
        const limit = Number(u.searchParams.get('limit') ?? 500);
        const last = server.lastSeq();
        if (since > last || (since < last && since < server.purgedThrough))
          return json(410, { code: 'RESYNC_REQUIRED', message: 'La copia local está desactualizada.' });
        const visible = server.log.filter((e) => e.seq > since && seen.includes(e.audience));
        const page = visible.slice(0, limit);
        const hasMore = visible.length > limit;
        return json(200, {
          changes: page.map((e) => ({
            seq: e.seq,
            entityType: e.entityType,
            entityId: e.entityId,
            op: e.op,
            payload: e.payload,
            refDate: e.refDate,
          })),
          nextSince: hasMore ? page.at(-1)!.seq : last,
          hasMore,
        });
      }
      if (path === '/sync/snapshot') {
        const all = [...server.current.values()]
          .filter((e) => seen.includes(e.audience))
          .sort((a, b) => `${a.entityType}:${a.entityId}`.localeCompare(`${b.entityType}:${b.entityId}`));
        const from = Number(u.searchParams.get('cursor') ?? 0);
        const page = all.slice(from, from + pageSize);
        const next = from + pageSize < all.length ? String(from + pageSize) : null;
        return json(200, {
          epoch: server.epoch,
          seq: server.lastSeq(),
          records: page.map((e) => ({
            entityType: e.entityType,
            entityId: e.entityId,
            payload: e.payload,
            refDate: e.refDate,
          })),
          nextCursor: next,
        });
      }
      return json(404, { code: 'NOT_FOUND', message: `Sin ruta ${path}` });
    }) as HttpTransport,

    /** platform.ws: un socket simulado que el servidor controla. */
    socket: (url: string): PlatformSocket => {
      server.attempts.push(Date.now());
      const s = new SimulatedSocket(url, server, server.refuse);
      if (!server.refuse) server.sockets.push(s);
      return s;
    },
  };
  return server;
}

export type SyncServer = ReturnType<typeof createSyncServer>;

export class SimulatedSocket implements PlatformSocket {
  sent: string[] = [];
  closed = false;
  private listeners: Record<string, ((data?: string) => void)[]> = {};

  constructor(
    readonly url: string,
    private readonly server: { sockets: SimulatedSocket[] },
    refused = false,
  ) {
    queueMicrotask(() => (refused ? this.drop(1006) : this.emit('open')));
  }

  send(data: string): void {
    this.sent.push(data);
    const msg = JSON.parse(data) as { type: string };
    if (msg.type === 'auth') queueMicrotask(() => this.receive({ type: 'ready' }));
  }

  close(): void {
    this.drop();
  }

  on(event: 'open' | 'message' | 'close' | 'error', listener: (data?: string) => void): void {
    (this.listeners[event] ??= []).push(listener);
  }

  receive(msg: Record<string, unknown>): void {
    if (!this.closed) this.emit('message', JSON.stringify(msg));
  }

  /** Se cae la conexión (o la cierra el servidor). */
  drop(code?: number): void {
    if (this.closed) return;
    this.closed = true;
    this.server.sockets = this.server.sockets.filter((s) => s !== this);
    this.emit('close', code === undefined ? undefined : String(code));
  }

  private emit(event: string, data?: string): void {
    for (const l of this.listeners[event] ?? []) l(data);
  }
}
