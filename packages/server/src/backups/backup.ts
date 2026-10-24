// T106 · RF-RES-01, 02, 04, RNF-14, plan §10.4: un respaldo. pg_dump -Fc (lee una instantánea sin bloquear escrituras,
// con prioridad baja) más la carpeta de archivos, empaquetados y cifrados en backups/<fecha>-<tipo>.icbak con su
// SHA-256. Se hace uno a la vez. El diario se copia además a la carpeta externa; si no está (la USB), queda pendiente.
import { AppError, type Clock } from '@impocaribe/shared';
import { and, desc, eq, isNotNull, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { constants, setPriority } from 'node:os';
import { basename, join } from 'node:path';
import type { Tx } from '../audit/audit-log.ts';
import { schemaVersion } from '../db/migrate.ts';
import { systemSettings } from '../db/schema/company.ts';
import { backups } from '../db/schema/backups.ts';
import { encryptFile } from './crypto.ts';
import { entriesOf, pack } from './pack.ts';
import { DAILY_KEEP, HOURLY_KEEP_MS } from './schedule.ts';

export type BackupKind = (typeof backups.$inferSelect)['kind'];
export type BackupRow = typeof backups.$inferSelect;

export interface BackupDeps {
  db: NodePgDatabase;
  clock: Clock;
  dataDir: string;
  /** Conexión con el rol dueño de la base (decisión del responsable): solo respaldo y restauración. */
  maintenanceUrl: string;
  /** Carpeta de pg_dump y pg_restore; vacía, los del PATH. */
  pgBin: string;
}

/** Lo que va en claro (y autenticado) en la cabecera del .icbak. */
export interface BackupMeta {
  kind: BackupKind;
  createdAt: string;
  format: 1;
  /** La versión del esquema de la base respaldada (schemaVersion): solo se restaura en la misma. */
  schema: number;
}

export const tool = (pgBin: string, name: string) => (pgBin ? join(pgBin, name) : name);

/** Ejecuta pg_dump o pg_restore con prioridad baja (RNF-14); la contraseña va por variable de entorno, no en la orden. */
export function runPg(pgBin: string, name: string, url: string, args: string[]): Promise<void> {
  const u = new URL(url);
  const password = decodeURIComponent(u.password);
  u.password = '';
  return new Promise((resolve, reject) => {
    const child = spawn(tool(pgBin, name), [`--dbname=${u.toString()}`, ...args], {
      env: { ...process.env, PGPASSWORD: password },
      windowsHide: true,
    });
    if (child.pid) {
      try {
        setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Sin permiso para cambiarla, sigue con la normal.
      }
    }
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (err) => reject(new Error(`No se pudo ejecutar ${name}: ${err.message}`)));
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${name} terminó con el código ${code}: ${stderr.trim().slice(0, 500)}`)),
    );
  });
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

const stamp = (d: Date) => d.toISOString().replace(/[:.]/g, '-');

let queue: Promise<unknown> = Promise.resolve();

/** Hace un respaldo de `kind`. Sin contraseña de respaldo no se hace (RF-RES-05): devuelve null. Uno a la vez. */
export function runBackup(d: BackupDeps, kind: BackupKind, createdBy?: string): Promise<BackupRow | null> {
  const run = queue.then(() => doBackup(d, kind, createdBy));
  queue = run.catch(() => undefined);
  return run;
}

async function doBackup(d: BackupDeps, kind: BackupKind, createdBy?: string): Promise<BackupRow | null> {
  const [settings] = await d.db.select().from(systemSettings);
  if (!settings?.backupPublicKey) return null;
  const startedAt = d.clock.now();
  const [row] = await d.db
    .insert(backups)
    .values({ kind, startedAt, createdBy: createdBy ?? null })
    .returning();
  const dir = join(d.dataDir, 'backups');
  const tmp = join(dir, `tmp-${row!.id}`);
  const filePath = `backups/${stamp(startedAt)}-${kind}.icbak`;
  try {
    await mkdir(tmp, { recursive: true });
    await runPg(d.pgBin, 'pg_dump', d.maintenanceUrl, ['--format=custom', `--file=${join(tmp, 'db.dump')}`]);
    const entries = [
      { name: 'db.dump', path: join(tmp, 'db.dump') },
      ...(await entriesOf(join(d.dataDir, 'files'), 'files')),
    ];
    await pack(entries, join(tmp, 'pack.bin'));
    const meta: BackupMeta = { kind, createdAt: startedAt.toISOString(), format: 1, schema: schemaVersion() };
    await encryptFile(join(tmp, 'pack.bin'), join(d.dataDir, filePath), settings.backupPublicKey, meta);
    const [done] = await d.db
      .update(backups)
      .set({
        status: 'ok',
        finishedAt: d.clock.now(),
        filePath,
        sizeBytes: (await stat(join(d.dataDir, filePath))).size,
        sha256: await sha256Of(join(d.dataDir, filePath)),
      })
      .where(eq(backups.id, row!.id))
      .returning();
    if (kind === 'daily') await copyExternal(d, done!);
    await prune(d);
    return (await d.db.select().from(backups).where(eq(backups.id, row!.id)))[0]!;
  } catch (err) {
    await rm(join(d.dataDir, filePath), { force: true });
    const [failed] = await d.db
      .update(backups)
      .set({ status: 'failed', finishedAt: d.clock.now(), error: err instanceof Error ? err.message : String(err) })
      .where(eq(backups.id, row!.id))
      .returning();
    return failed!;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** Copia el diario a la carpeta externa; si no se puede (la USB no está), queda pendiente y se reintenta. */
export async function copyExternal(d: BackupDeps, row: BackupRow): Promise<boolean> {
  const [settings] = await d.db.select({ dir: systemSettings.externalBackupDir }).from(systemSettings);
  await d.db.update(backups).set({ error: null }).where(eq(backups.id, row.id));
  if (!settings?.dir || !row.filePath) return false;
  const target = join(settings.dir, basename(row.filePath));
  try {
    await copyFile(join(d.dataDir, row.filePath), target);
    await d.db
      .update(backups)
      .set({ externalPath: target, externalCopiedAt: d.clock.now() })
      .where(eq(backups.id, row.id));
    await pruneExternal(settings.dir);
    return true;
  } catch (err) {
    await d.db
      .update(backups)
      .set({ error: `No se pudo copiar a ${settings.dir}: ${err instanceof Error ? err.message : String(err)}` })
      .where(eq(backups.id, row.id));
    return false;
  }
}

/** RF-RES-01: los de cada hora, 48 horas; los diarios, los últimos 30. El registro se conserva; el archivo, no. */
async function prune(d: BackupDeps) {
  const limit = new Date(d.clock.now().getTime() - HOURLY_KEEP_MS);
  const old = await d.db
    .select()
    .from(backups)
    .where(and(eq(backups.kind, 'hourly'), isNotNull(backups.filePath), lt(backups.startedAt, limit)));
  const dailies = await d.db
    .select()
    .from(backups)
    .where(and(eq(backups.kind, 'daily'), isNotNull(backups.filePath)))
    .orderBy(desc(backups.startedAt));
  for (const r of [...old, ...dailies.slice(DAILY_KEEP)]) {
    await rm(join(d.dataDir, r.filePath!), { force: true });
    await d.db.update(backups).set({ filePath: null }).where(eq(backups.id, r.id));
  }
}

async function pruneExternal(dir: string) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('-daily.icbak')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - DAILY_KEEP))) await rm(join(dir, f), { force: true });
}

/** El último respaldo de cada tipo y si hay un diario con la copia externa pendiente. */
export async function lastRuns(db: NodePgDatabase) {
  const latest = async (kind: BackupKind) =>
    (await db.select().from(backups).where(eq(backups.kind, kind)).orderBy(desc(backups.startedAt)).limit(1))[0] ??
    null;
  const daily = await latest('daily');
  return {
    hourly: (await latest('hourly'))?.startedAt ?? null,
    daily: daily?.startedAt ?? null,
    pendingDaily: daily && daily.status === 'ok' && !daily.externalCopiedAt ? daily : null,
  };
}

/** Para AL-12: el último respaldo terminado, el último bueno y la última copia externa. */
export async function backupHealthRows(db: NodePgDatabase | Tx) {
  const [last] = await db
    .select()
    .from(backups)
    .where(sql`${backups.status} <> 'running'`)
    .orderBy(desc(backups.startedAt))
    .limit(1);
  const [ok] = await db
    .select({ at: backups.startedAt })
    .from(backups)
    .where(eq(backups.status, 'ok'))
    .orderBy(desc(backups.startedAt))
    .limit(1);
  const [external] = await db
    .select({ at: backups.externalCopiedAt })
    .from(backups)
    .where(isNotNull(backups.externalCopiedAt))
    .orderBy(desc(backups.externalCopiedAt))
    .limit(1);
  return { last: last ?? null, lastOk: ok?.at ?? null, lastExternal: external?.at ?? null };
}

export const noPassword = () =>
  new AppError('VALIDATION_ERROR', 'Defina la contraseña de respaldo antes de hacer un respaldo.');
