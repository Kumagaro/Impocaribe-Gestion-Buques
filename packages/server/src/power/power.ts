// T132 · RF-ENE-01 a 05 y plan §10.6: el estado de energía del servidor. Lo consulta cada 30 s y, cuando cambia, avisa
// a todas las apps (server.power) y a las alertas (AL-20). Al 15 % o menos entra en modo protegido: deja terminar las
// escrituras en curso (como mucho 30 s), asegura los datos en disco (CHECKPOINT) y rechaza las nuevas (app.ts). Al 5 %
// o menos se detiene de forma ordenada. Con corriente de nuevo, sale solo del modo protegido.
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { powerMode, type PowerMode, type PowerReading } from '@impocaribe/shared';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Realtime } from '../sync/realtime.ts';
import { DB, POWER_ENABLED, POWER_PROVIDER, POWER_SHUTDOWN } from '../tokens.ts';
import type { PowerProvider } from './provider.ts';

export const POWER_EVERY_MS = 30_000;
/** Lo que se espera a que terminen las escrituras en curso al entrar en modo protegido. */
export const DRAIN_MS = 30_000;

export interface PowerSnapshot {
  onBattery: boolean;
  percent: number | null;
  protected: boolean;
}

@Injectable()
export class Power implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Power');
  private reading: PowerReading = { onBattery: false, percent: null };
  private current: PowerMode = 'mains';
  private writes = 0;
  private drained: (() => void)[] = [];
  private readonly listeners = new Set<() => void>();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(POWER_PROVIDER) private readonly provider: PowerProvider,
    @Inject(POWER_ENABLED) private readonly enabled: boolean,
    @Inject(POWER_SHUTDOWN) private readonly shutdown: () => Promise<void>,
    @Inject(DB) private readonly db: NodePgDatabase,
    private readonly realtime: Realtime,
  ) {}

  onApplicationBootstrap(): void {
    // Cada app que se conecta recibe el estado si no es el normal (con corriente no hay nada que avisar).
    this.realtime.onReady((send) => {
      if (this.current !== 'mains') send({ type: 'server.power', ...this.snapshot() });
    });
    if (!this.enabled) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), POWER_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  get mode(): PowerMode {
    return this.current;
  }

  /** En modo protegido (y al detenerse) no se aceptan escrituras nuevas. */
  get protected(): boolean {
    return this.current === 'protected' || this.current === 'stop';
  }

  snapshot(): PowerSnapshot {
    return { onBattery: this.reading.onBattery, percent: this.reading.percent, protected: this.protected };
  }

  /** La lectura actual, para AL-20. */
  get state(): PowerReading {
    return this.reading;
  }

  /** Cuando cambia el estado (AL-20 se reevalúa). */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Una escritura que empieza; la función que devuelve la da por terminada (se puede llamar más de una vez). */
  beginWrite(): () => void {
    this.writes++;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.writes--;
      if (this.writes === 0) for (const resolve of this.drained.splice(0)) resolve();
    };
  }

  /** Una consulta del estado (cada 30 s; las pruebas la llaman con el proveedor simulado). */
  async check(): Promise<void> {
    let next: PowerReading;
    try {
      next = await this.provider.read();
    } catch (err) {
      this.log.warn(`No se pudo leer el estado de la energía: ${String(err)}`);
      return;
    }
    const before = this.current;
    const wasProtected = this.protected;
    const changed = next.onBattery !== this.reading.onBattery || next.percent !== this.reading.percent;
    this.reading = next;
    this.current = powerMode(next);
    if (!changed && this.current === before) return;
    if (this.protected && !wasProtected) await this.secure();
    this.realtime.broadcast({ type: 'server.power', ...this.snapshot() });
    for (const fn of this.listeners) fn();
    if (this.current === 'stop' && before !== 'stop') {
      this.log.warn('Batería al 5 % o menos: el servidor se detiene de forma ordenada.');
      await this.shutdown();
    }
  }

  /** Deja terminar las escrituras en curso (como mucho DRAIN_MS) y asegura en disco lo escrito. */
  private async secure(): Promise<void> {
    if (this.writes > 0)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, DRAIN_MS);
        this.drained.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    try {
      await this.db.execute(sql`CHECKPOINT`);
    } catch (err) {
      // El rol de la app puede no tener permiso (pg_checkpoint); PostgreSQL igual escribe su registro antes de confirmar.
      this.log.warn(`No se pudo forzar CHECKPOINT: ${String(err)}`);
    }
  }
}
