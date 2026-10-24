// T113 · DT-11, RF-UPD-01, 04: la versión mínima compatible de cada app. La del servidor (MIN_APP_VERSION, la que pide
// su API) es el piso; una Apoderada puede subirla marcando una versión publicada. La app dice su plataforma en
// X-App-Platform; sin ella (el navegador de pruebas) vale solo el piso.
import { compareVersions } from '@impocaribe/shared';
import type { AppPlatform } from '@impocaribe/shared/validation';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { appReleases } from '../db/schema/updates.ts';
import { DB, MIN_APP_VERSION } from '../tokens.ts';

/** Una restauración puede cambiar las versiones publicadas: la mínima se vuelve a leer al menos cada 30 s. */
const TTL_MS = 30_000;

export const isAppPlatform = (p: string | undefined): p is AppPlatform => p === 'windows' || p === 'android';

@Injectable()
export class AppVersions {
  private readonly log = new Logger('AppVersions');
  private mins = new Map<AppPlatform, string>();
  private readAt = 0;
  private reading: Promise<void> | null = null;

  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(MIN_APP_VERSION) private readonly floor: string,
  ) {}

  /** Vuelve a leer las mínimas publicadas (al publicar, al marcar la mínima y, si pasó el plazo, al consultarla). */
  async refresh(): Promise<void> {
    const rows = await this.db
      .select({ platform: appReleases.platform, version: appReleases.version })
      .from(appReleases)
      .where(eq(appReleases.isMinSupported, true));
    this.mins = new Map(
      rows.filter((r) => isAppPlatform(r.platform)).map((r) => [r.platform as AppPlatform, r.version]),
    );
    this.readAt = Date.now();
  }

  /** La mínima de la plataforma: la publicada o la del servidor, la mayor. */
  async minFor(platform: string | undefined): Promise<string> {
    if (Date.now() - this.readAt > TTL_MS) {
      // Si la base no responde, vale lo último leído (y siempre el piso): no se bloquea a nadie por esto.
      this.reading ??= this.refresh()
        .catch((err: unknown) => {
          this.readAt = Date.now();
          this.log.warn(`No se pudo leer la versión mínima publicada: ${String(err)}`);
        })
        .finally(() => (this.reading = null));
      await this.reading;
    }
    const published = isAppPlatform(platform) ? this.mins.get(platform) : undefined;
    return published && compareVersions(published, this.floor) > 0 ? published : this.floor;
  }
}
