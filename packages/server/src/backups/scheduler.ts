// T106 · RF-RES-01, plan §10.4: el programador de respaldos, dentro del servidor (DT-08). Cada minuto mira si toca el de
// la hora (en la jornada), el diario o reintentar la copia externa del diario (cada 30 minutos).
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type { Clock } from '@impocaribe/shared';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { systemSettings } from '../db/schema/company.ts';
import { BACKUPS_ENABLED, CLOCK, DATA_DIR, DB, MAINTENANCE_DB_URL, PG_BIN } from '../tokens.ts';
import { copyExternal, lastRuns, runBackup, type BackupDeps } from './backup.ts';
import { due } from './schedule.ts';

const TICK_MS = 60_000;

@Injectable()
export class BackupScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('BackupScheduler');
  private timer: NodeJS.Timeout | undefined;
  private externalTried: Date | null = null;
  private busy = false;
  readonly deps: BackupDeps;

  constructor(
    @Inject(DB) db: NodePgDatabase,
    @Inject(CLOCK) clock: Clock,
    @Inject(DATA_DIR) dataDir: string,
    @Inject(MAINTENANCE_DB_URL) maintenanceUrl: string,
    @Inject(PG_BIN) pgBin: string,
    @Inject(BACKUPS_ENABLED) private readonly enabled: boolean,
  ) {
    this.deps = { db, clock, dataDir, maintenanceUrl, pgBin };
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Una vuelta del programador; pública para las pruebas. */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const { db, clock } = this.deps;
      const [s] = await db.select().from(systemSettings);
      if (!s?.backupPublicKey) return;
      const last = await lastRuns(db);
      const now = clock.now();
      const todo = due(now, s, {
        hourly: last.hourly,
        daily: last.daily,
        externalTried: this.externalTried,
        externalPending: last.pendingDaily !== null,
      });
      if (todo.daily) {
        // El diario ya intenta la copia externa: el reintento cuenta desde ahora.
        this.externalTried = now;
        await runBackup(this.deps, 'daily');
      } else if (todo.hourly) await runBackup(this.deps, 'hourly');
      if (!todo.daily && todo.external && last.pendingDaily) {
        this.externalTried = now;
        await copyExternal(this.deps, last.pendingDaily);
      }
    } catch (err) {
      this.log.error(`No se pudo hacer el respaldo programado: ${String(err)}`);
    } finally {
      this.busy = false;
    }
  }
}
