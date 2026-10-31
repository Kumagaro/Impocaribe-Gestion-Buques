// T129 · RF-INS-06 y RF-UPD-01: al actualizar el servidor, se publican el instalador ligero y el APK que trae el
// instalador completo nuevo (carpeta `publicar` del server-bundle, con su `publicar.json`). Igual que publicarlos en
// P-26, pero sin Apoderada: queda en la bitácora como hecho por el instalador. Una versión ya publicada, o más vieja que
// la publicada, se salta.
import { compareVersions, isVersion, type Clock } from '@impocaribe/shared';
import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { auditedTransaction } from '../audit/audit-log.ts';
import { appReleases } from '../db/schema/updates.ts';
import { hashFile, storeFileFromPath } from '../files/files.ts';
import { RELEASE_MIME } from './updates.controller.ts';

/** Lo que describe `publicar.json`: un archivo por plataforma, con su versión (y la firma del de Windows, T117). */
export interface BundledRelease {
  platform: 'windows' | 'android';
  version: string;
  file: string;
  signature?: string;
}

export async function publishBundled(
  db: NodePgDatabase,
  clock: Clock,
  dataDir: string,
  dir: string,
): Promise<string[]> {
  const list = JSON.parse(await readFile(join(dir, 'publicar.json'), 'utf8')) as BundledRelease[];
  const done: string[] = [];
  for (const r of list) {
    if ((r.platform !== 'windows' && r.platform !== 'android') || !isVersion(r.version))
      throw new Error(`publicar.json: entrada no válida (${JSON.stringify(r)}).`);
    if (r.platform === 'windows' && !r.signature)
      throw new Error(`publicar.json: el instalador de Windows ${r.version} no trae su firma.`);
    const label = r.platform === 'windows' ? 'Windows' : 'Android';
    const path = join(dir, r.file);
    const same = await db
      .select({ version: appReleases.version })
      .from(appReleases)
      .where(eq(appReleases.platform, r.platform));
    const newest = same
      .map((x) => x.version)
      .sort(compareVersions)
      .at(-1);
    if (newest && compareVersions(r.version, newest) <= 0) {
      done.push(`${label} ${r.version}: ya está publicada la ${newest}.`);
      continue;
    }
    const sha256 = await hashFile(path);
    const message = await auditedTransaction(
      db,
      clock,
      { action: 'release.publish', entityType: 'app_release' },
      async (tx) => {
        const stored = await storeFileFromPath(tx, clock, dataDir, path, sha256, RELEASE_MIME[r.platform]);
        const [row] = await tx
          .insert(appReleases)
          .values({
            platform: r.platform,
            version: r.version,
            fileId: stored.id,
            sha256,
            notes: 'Publicada al actualizar el servidor.',
            signature: r.platform === 'windows' ? r.signature! : null,
            publishedBy: null,
            publishedAt: clock.now(),
          })
          .returning();
        // AL-15: cada app conectada de esa plataforma se entera.
        await tx.execute(
          sql`SELECT pg_notify('impocaribe_release', ${JSON.stringify({ platform: r.platform, version: r.version, mandatory: false })})`,
        );
        return {
          value: `${label} ${r.version} publicada.`,
          entityId: row!.id,
          after: { platform: r.platform, version: r.version, sha256, sizeBytes: stored.sizeBytes, auto: true },
        };
      },
    );
    done.push(message);
  }
  return done;
}
