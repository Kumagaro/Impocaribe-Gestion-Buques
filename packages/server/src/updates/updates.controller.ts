// T113 · RF-UPD-01 a 05, plan §6.2 (Actualizaciones): publicar el instalador ligero y el APK (y los del WebView para
// P-27), marcar la versión mínima, consultar si hay una nueva y descargarla del servidor local, sin internet (RNF-11).
// La consulta y la descarga son públicas: P-27 descarga el WebView antes de que la interfaz pueda arrancar.
import { AppError, compareVersions, isBelowMinVersion, isVersion, type Clock } from '@impocaribe/shared';
import {
  PLATFORM_LABELS,
  publishReleaseSchema,
  releaseDtoSchema,
  releasePlatformSchema,
  updateCheckQuerySchema,
  updateCheckSchema,
  type ReleaseDto,
  type ReleasePlatform,
  type UpdateCheck,
} from '@impocaribe/shared/validation';
import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { Tx } from '../audit/audit-log.ts';
import { ALL_ROLES } from '../auth/auth.controller.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { files } from '../db/schema/company.ts';
import { devices } from '../db/schema/devices.ts';
import { appReleases } from '../db/schema/updates.ts';
import { users } from '../db/schema/users.ts';
import { hashFile, storeFileFromPath } from '../files/files.ts';
import { auditedWrite } from '../http/audited-write.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DATA_DIR, DB } from '../tokens.ts';
import { AppVersions, isAppPlatform } from './app-versions.ts';

const A = ['apoderada'] as const;
/** El instalador ligero y el APK pesan decenas de MB; el completo (que no se publica) pasa de este límite. */
export const MAX_INSTALLER_BYTES = 300 * 1024 * 1024;

const MIME: Record<ReleasePlatform, string> = {
  windows: 'application/vnd.microsoft.portable-executable',
  android: 'application/vnd.android.package-archive',
  'android-webview-chrome': 'application/vnd.android.package-archive',
  'android-webview-system': 'application/vnd.android.package-archive',
};
const fileName = (p: ReleasePlatform, v: string) =>
  p === 'windows' ? `impocaribe-${v}.exe` : p === 'android' ? `impocaribe-${v}.apk` : `${p}-${v}.apk`;
/** Un instalador de Windows empieza por «MZ»; un APK es un ZIP («PK\x03\x04»). */
const looksLike = (p: ReleasePlatform, head: Buffer) =>
  p === 'windows' ? head.subarray(0, 2).toString('latin1') === 'MZ' : head.toString('latin1') === 'PK\x03\x04';
export const downloadUrl = (p: ReleasePlatform, v: string) => `/api/v1/updates/${p}/${v}/download`;

/**
 * Las versiones con su archivo, quién las publicó y cuántos dispositivos activos de su plataforma se vieron por última
 * vez con una anterior (T114: lo que deja fuera marcarla como mínima).
 */
async function releaseDtos(db: NodePgDatabase | Tx, where?: SQL): Promise<ReleaseDto[]> {
  const rows = await db
    .select({ r: appReleases, size: files.sizeBytes, name: users.fullName })
    .from(appReleases)
    .innerJoin(files, eq(files.id, appReleases.fileId))
    .leftJoin(users, eq(users.id, appReleases.publishedBy))
    .where(where)
    .orderBy(desc(appReleases.publishedAt), desc(appReleases.id));
  const seen = await db
    .select({ platform: devices.platform, version: devices.appVersion })
    .from(devices)
    .where(and(isNull(devices.revokedAt), isNotNull(devices.appVersion)));
  return rows.map(({ r, size, name }) => ({
    id: r.id,
    platform: r.platform,
    version: r.version,
    sha256: r.sha256,
    sizeBytes: size,
    notes: r.notes,
    isMinSupported: r.isMinSupported,
    devicesBelow: seen.filter((d) => d.platform === r.platform && compareVersions(d.version!, r.version) < 0).length,
    publishedByName: name,
    publishedAt: r.publishedAt.toISOString(),
  }));
}
const invalid = (field: string, message: string) =>
  new AppError('VALIDATION_ERROR', message, { fields: { [field]: message } });

/** Lo multer deja de un archivo subido (sus tipos no vienen con Nest). */
interface Uploaded {
  path: string;
  size: number;
}

@Controller('updates')
export class UpdatesController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DATA_DIR) private readonly dataDir: string,
    private readonly versions: AppVersions,
  ) {}

  /** P-26: las versiones publicadas, la más reciente primero. */
  @Get()
  @Contract({ output: z.array(releaseDtoSchema), roles: ALL_ROLES })
  async list(): Promise<ReleaseDto[]> {
    return releaseDtos(this.db);
  }

  /** RF-UPD-02 a 04: la más nueva de la plataforma y si la instalada ya no es compatible. */
  @Get('check')
  @Contract({ output: updateCheckSchema, roles: 'public' })
  async check(
    @Query(new ZodValidationPipe(updateCheckQuerySchema)) q: z.output<typeof updateCheckQuerySchema>,
  ): Promise<UpdateCheck> {
    const all = await this.db.select().from(appReleases).where(eq(appReleases.platform, q.platform));
    const latest = all.sort((a, b) => compareVersions(b.version, a.version))[0] ?? null;
    const app = isAppPlatform(q.platform);
    const minSupported = app
      ? await this.versions.minFor(q.platform)
      : (all.find((r) => r.isMinSupported)?.version ?? null);
    return {
      latest: latest?.version ?? null,
      minSupported,
      mustUpdate: minSupported !== null && isBelowMinVersion(q.version, minSupported),
      updateAvailable: latest !== null && (!isVersion(q.version) || compareVersions(latest.version, q.version) > 0),
      notes: latest?.notes ?? null,
      downloadUrl: latest ? downloadUrl(latest.platform, latest.version) : null,
      sha256: latest?.sha256 ?? null,
      signature: latest?.signature ?? null,
    };
  }

  /** RF-UPD-05: el instalador, con su huella en la cabecera para comprobarlo antes de instalar. */
  @Get(':platform/:version/download')
  @Contract({ roles: 'public' })
  async download(@Param('platform') platform: string, @Param('version') version: string, @Res() res: Response) {
    const p = releasePlatformSchema.safeParse(platform);
    const [row] = p.success
      ? await this.db
          .select({ sha256: appReleases.sha256, path: files.storagePath, size: files.sizeBytes })
          .from(appReleases)
          .innerJoin(files, eq(files.id, appReleases.fileId))
          .where(and(eq(appReleases.platform, p.data), eq(appReleases.version, version)))
      : [];
    if (!p.success || !row) throw new AppError('NOT_FOUND', 'Esa versión no está publicada en este servidor.');
    res.set({
      'Content-Type': MIME[p.data],
      'Content-Length': String(row.size),
      'Content-Disposition': `attachment; filename="${fileName(p.data, version)}"`,
      'X-Content-SHA256': row.sha256,
    });
    createReadStream(join(this.dataDir, row.path)).pipe(res);
  }

  /** RF-UPD-01: publicar una versión (multipart: `file` y los campos de publishReleaseSchema). */
  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', { dest: tmpdir(), limits: { fileSize: MAX_INSTALLER_BYTES, files: 1 } }))
  @Contract({ output: releaseDtoSchema, roles: A })
  async publish(
    @Req() req: AuthedRequest & { rawBody?: Buffer },
    @UploadedFile() file: Uploaded | undefined,
    @Res() res: Response,
  ) {
    try {
      const input = new ZodValidationPipe(publishReleaseSchema).transform(req.body) as z.output<
        typeof publishReleaseSchema
      >;
      if (!file) throw invalid('file', 'Elija el archivo del instalador.');
      const head = Buffer.alloc(4);
      const fh = await open(file.path, 'r');
      await fh.read(head, 0, 4, 0).finally(() => fh.close());
      if (!looksLike(input.platform, head))
        throw invalid(
          'file',
          input.platform === 'windows'
            ? 'El archivo no es un instalador de Windows (.exe).'
            : 'El archivo no es un instalador de Android (.apk).',
        );
      const sha256 = await hashFile(file.path);
      // DT-22: la huella de la petición son los campos y la del archivo (el cuerpo multipart no se guarda).
      req.rawBody = Buffer.from(JSON.stringify({ ...input, sha256 }));
      const { userId, sessionId, deviceId } = req.auth;
      const result = await auditedWrite(
        this.db,
        this.clock,
        req,
        { userId, sessionId, deviceId, action: 'release.publish', entityType: 'app_release' },
        async (tx) => {
          const same = await tx
            .select({ version: appReleases.version })
            .from(appReleases)
            .where(eq(appReleases.platform, input.platform));
          const label = PLATFORM_LABELS[input.platform];
          if (same.some((r) => r.version === input.version))
            throw invalid('version', `La versión ${input.version} de ${label} ya está publicada.`);
          const newest = same
            .map((r) => r.version)
            .sort(compareVersions)
            .at(-1);
          if (newest && compareVersions(input.version, newest) < 0)
            throw invalid('version', `Ya está publicada la ${newest} de ${label}: publique una versión más nueva.`);
          const stored = await storeFileFromPath(tx, this.clock, this.dataDir, file.path, sha256, MIME[input.platform]);
          const [row] = await tx
            .insert(appReleases)
            .values({
              platform: input.platform,
              version: input.version,
              fileId: stored.id,
              sha256,
              notes: input.notes,
              signature: input.platform === 'windows' ? input.signature : null,
              publishedBy: userId,
              publishedAt: this.clock.now(),
            })
            .returning();
          // AL-15: cada app conectada de esa plataforma se entera ahora (sale al confirmar la transacción).
          if (isAppPlatform(input.platform))
            await tx.execute(
              sql`SELECT pg_notify('impocaribe_release', ${JSON.stringify({ platform: input.platform, version: input.version, mandatory: false })})`,
            );
          return {
            status: 201,
            body: (await releaseDtos(tx, eq(appReleases.id, row!.id)))[0]!,
            entityId: row!.id,
            after: { platform: input.platform, version: input.version, sha256, sizeBytes: stored.sizeBytes },
          };
        },
      );
      res.status(result.status).json(result.body);
    } finally {
      if (file) await rm(file.path, { force: true });
    }
  }

  /** RF-UPD-01, 04: la versión mínima compatible de su plataforma; las anteriores dejan de poder escribir y sincronizar. */
  @Post(':id/min-supported')
  @Contract({ output: releaseDtoSchema, roles: A })
  async minSupported(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest, @Res() res: Response) {
    const { userId, sessionId, deviceId } = req.auth;
    const result = await auditedWrite(
      this.db,
      this.clock,
      req,
      { userId, sessionId, deviceId, action: 'release.min_supported', entityType: 'app_release', entityId: id },
      async (tx) => {
        const [release] = await tx.select().from(appReleases).where(eq(appReleases.id, id)).for('update');
        if (!release) throw new AppError('NOT_FOUND', 'Esa versión no está publicada.');
        if (!isAppPlatform(release.platform))
          throw new AppError('VALIDATION_ERROR', 'Solo las apps de Windows y Android tienen versión mínima.');
        const [before] = await tx
          .update(appReleases)
          .set({ isMinSupported: false })
          .where(and(eq(appReleases.platform, release.platform), eq(appReleases.isMinSupported, true)))
          .returning({ version: appReleases.version });
        await tx.update(appReleases).set({ isMinSupported: true }).where(eq(appReleases.id, id));
        await tx.execute(
          sql`SELECT pg_notify('impocaribe_release', ${JSON.stringify({ platform: release.platform, version: release.version, mandatory: true })})`,
        );
        return {
          status: 200,
          body: (await releaseDtos(tx, eq(appReleases.id, id)))[0]!,
          before: { platform: release.platform, minSupported: before?.version ?? null },
          after: { platform: release.platform, minSupported: release.version },
        };
      },
    );
    await this.versions.refresh();
    res.status(result.status).json(result.body);
  }
}
