// T043 · plan §6.4 y RNF-04: WebSocket en /api/v1/ws, en el mismo servidor HTTPS. Los avisos salen de NOTIFY de la
// base (migración 0006), que solo se entregan tras el COMMIT: la app nunca pide un cambio que aún no se ve.
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Clock } from '@impocaribe/shared';
import type { WsServerMessage } from '@impocaribe/shared/validation';
import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type pg from 'pg';
import { WebSocketServer, type WebSocket } from 'ws';
import { hashToken } from '../auth/sessions.ts';
import { devices } from '../db/schema/devices.ts';
import { sessions, users } from '../db/schema/users.ts';
import { CLOCK, DB } from '../tokens.ts';

export const WS_PATH = '/api/v1/ws';
/** Plan §6.4: un ping cada 25 s; quien no contesta se da por desconectado. */
export const PING_MS = 25_000;
/** Plazo para el primer mensaje, `{type: "auth", token}`. */
export const AUTH_TIMEOUT_MS = 10_000;
/** Cierre por token inválido o vencido: la app no reintenta con ese token. */
export const CLOSE_UNAUTHORIZED = 4401;

const CHANNELS = [
  'impocaribe_sync',
  'impocaribe_epoch',
  'impocaribe_session',
  'impocaribe_device',
  'impocaribe_alert',
  'impocaribe_release',
] as const;

/** Lo que manda el trigger de la migración 0011 al insertar una alerta. */
interface AlertNotice {
  id: string;
  type: string;
  title: string;
  roles: string[];
  target: string | null;
}

/** Lo que manda NOTIFY al publicar una versión o marcar la mínima (updates.controller.ts). */
interface ReleaseNotice {
  platform: 'windows' | 'android';
  version: string;
  mandatory: boolean;
}

interface Client {
  socket: WebSocket;
  sessionId: string;
  deviceId: string;
  userId: string;
  role: string;
  /** `app` recibe todo; el token de dispositivo (DT-05) solo session.revoked (y alert.created, con las alertas). */
  kind: 'app' | 'device';
  alive: boolean;
}

@Injectable()
export class Realtime implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Realtime');
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  private readonly clients = new Set<Client>();
  private listener: pg.PoolClient | null = null;
  private pinger: NodeJS.Timeout | undefined;
  private closing = false;
  private readonly syncListeners = new Set<() => void>();
  private readonly readyListeners = new Set<(send: (msg: WsServerMessage) => void) => void>();
  private readonly connectionListeners = new Set<() => void>();

  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly adapter: HttpAdapterHost,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const server = this.adapter.httpAdapter.getHttpServer() as import('node:http').Server;
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (new URL(req.url ?? '/', 'http://x').pathname !== WS_PATH) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws));
    });
    this.pinger = setInterval(() => this.ping(), PING_MS);
    this.pinger.unref();
    await this.listen();
  }

  async onApplicationShutdown(): Promise<void> {
    this.closing = true;
    clearInterval(this.pinger);
    for (const c of this.clients) c.socket.terminate();
    this.wss.close();
    this.listener?.release(true);
  }

  /** Avisa de cada cambio sincronizado (lo usa el evaluador de alertas, T094). */
  onSync(fn: () => void): () => void {
    this.syncListeners.add(fn);
    return () => this.syncListeners.delete(fn);
  }

  /** T132: a cada app que se conecta se le puede mandar el estado actual (la energía). */
  onReady(fn: (send: (msg: WsServerMessage) => void) => void): () => void {
    this.readyListeners.add(fn);
    return () => this.readyListeners.delete(fn);
  }

  /** T132: un aviso a todas las apps conectadas (no al token de dispositivo, que solo recibe alertas). */
  broadcast(msg: WsServerMessage): void {
    for (const c of this.clients) if (c.kind === 'app') this.send(c, msg);
  }

  /**
   * T134 · RF-RED-01: cuántos dispositivos están conectados ahora (uno con la app abierta y el servicio de alertas
   * cuenta una vez).
   */
  connectedDevices(): number {
    return new Set([...this.clients].map((c) => c.deviceId)).size;
  }

  /** T134: cuando un dispositivo se conecta o se desconecta (AL-21 se reevalúa). */
  onConnections(fn: () => void): () => void {
    this.connectionListeners.add(fn);
    return () => this.connectionListeners.delete(fn);
  }

  private connectionsChanged(): void {
    for (const fn of this.connectionListeners) fn();
  }

  /** Un cliente dedicado a LISTEN; si se cae la conexión, se rehace. */
  private async listen(): Promise<void> {
    const pool = (this.db as unknown as { $client: pg.Pool }).$client;
    try {
      const client = await pool.connect();
      client.on('notification', (n) => this.dispatch(n.channel, n.payload ?? ''));
      client.on('error', (err) => {
        this.log.warn(`Se perdió la escucha de avisos de la base: ${err.message}. Reintentando.`);
        client.release(true);
        this.listener = null;
        if (!this.closing) setTimeout(() => void this.listen(), 1000).unref();
      });
      await client.query(CHANNELS.map((c) => `LISTEN ${c};`).join(' '));
      this.listener = client;
    } catch (err) {
      this.log.warn(`No se pudo escuchar los avisos de la base: ${String(err)}. Reintentando.`);
      if (!this.closing) setTimeout(() => void this.listen(), 1000).unref();
    }
  }

  private accept(socket: WebSocket): void {
    const timer = setTimeout(() => socket.close(CLOSE_UNAUTHORIZED, 'Sin autenticación'), AUTH_TIMEOUT_MS);
    socket.once('message', (data) => {
      clearTimeout(timer);
      void this.authenticate(socket, data.toString());
    });
  }

  private async authenticate(socket: WebSocket, raw: string): Promise<void> {
    let token: unknown;
    try {
      const msg = JSON.parse(raw) as { type?: unknown; token?: unknown };
      if (msg.type === 'auth') token = msg.token;
    } catch {
      // Cae al cierre de abajo.
    }
    const session = typeof token === 'string' ? await this.findSession(token) : null;
    if (!session) {
      socket.close(CLOSE_UNAUTHORIZED, 'La sesión no es válida');
      return;
    }
    const client: Client = { socket, ...session, alive: true };
    this.clients.add(client);
    this.connectionsChanged();
    socket.on('pong', () => (client.alive = true));
    socket.on('close', () => {
      this.clients.delete(client);
      this.connectionsChanged();
    });
    socket.on('error', () => socket.terminate());
    this.send(client, { type: 'ready' });
    if (client.kind === 'app') for (const fn of this.readyListeners) fn((msg) => this.send(client, msg));
  }

  /** La sesión del token, si está vigente, su usuario activo y su dispositivo sin revocar. */
  private async findSession(token: string) {
    const [row] = await this.db
      .select({
        sessionId: sessions.id,
        deviceId: sessions.deviceId,
        userId: users.id,
        role: users.role,
        kind: sessions.kind,
        expiresAt: sessions.expiresAt,
        active: users.active,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(devices, and(eq(devices.id, sessions.deviceId), isNull(devices.revokedAt)))
      .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)));
    if (!row || !row.active || row.expiresAt <= this.clock.now()) return null;
    return { sessionId: row.sessionId, deviceId: row.deviceId, userId: row.userId, role: row.role, kind: row.kind };
  }

  private dispatch(channel: string, payload: string): void {
    if (channel === 'impocaribe_sync') for (const fn of this.syncListeners) fn();
    const alert = channel === 'impocaribe_alert' ? (JSON.parse(payload) as AlertNotice) : null;
    // T113 · AL-15: una versión nueva (o la mínima) de una app; cada app mira si es la suya.
    const release = channel === 'impocaribe_release' ? (JSON.parse(payload) as ReleaseNotice) : null;
    for (const c of this.clients) {
      // RF-ALR-05: solo a quien la ve; también al token de dispositivo (DT-05). RF-ALR-02: tipo y referencia.
      if (alert && (alert.roles.includes(c.role) || alert.target === c.userId))
        this.send(c, { type: 'alert.created', id: alert.id, alertType: alert.type, title: alert.title });
      else if (release && c.kind === 'app') this.send(c, { type: 'app.update', ...release });
      else if (channel === 'impocaribe_sync' && c.kind === 'app')
        this.send(c, { type: 'sync.available', seq: Number(payload) });
      else if (channel === 'impocaribe_epoch' && c.kind === 'app') this.send(c, { type: 'sync.epoch_changed' });
      else if (channel === 'impocaribe_session' && c.sessionId === payload) this.drop(c, { type: 'session.revoked' });
      else if (channel === 'impocaribe_device' && c.deviceId === payload && c.kind === 'app')
        this.drop(c, { type: 'device.revoked' });
    }
  }

  private send(c: Client, msg: WsServerMessage): void {
    if (c.socket.readyState === c.socket.OPEN) c.socket.send(JSON.stringify(msg));
  }

  /** Avisa y cierra: esa sesión o ese dispositivo ya no reciben nada más. */
  private drop(c: Client, msg: WsServerMessage): void {
    this.send(c, msg);
    this.clients.delete(c);
    c.socket.close(1000, msg.type);
  }

  private ping(): void {
    for (const c of this.clients) {
      if (!c.alive) {
        c.socket.terminate();
        continue;
      }
      c.alive = false;
      c.socket.ping();
    }
  }
}
