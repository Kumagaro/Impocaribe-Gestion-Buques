// T107 · RF-RES-03, 06, D12, plan §5.10 y §10.4: restaurar un respaldo.
//  1. La contraseña abre la clave privada (si no, nada cambia).
//  2. Modo mantenimiento: 503 a todo y las tareas en segundo plano paradas.
//  3. Respaldo pre_restore y lectura del estado actual: el mayor número de cada buque y las órdenes, con sus versiones y
//     archivos. (El plan lo saca del pre_restore cargado en una base temporal; leer la base viva antes de restaurar da lo
//     mismo y es más simple. Si no se puede, modo de confirmación de la numeración, T108.)
//  4. pg_restore --clean en una sola transacción (si falla, la base queda como estaba) y los archivos.
//  5. Se reponen lo que no debe volver atrás: el historial de respaldos y restauraciones, los dispositivos (los
//     emparejados y los revocados después del respaldo) y las claves de respaldo (vale la contraseña actual).
//  6. D12: el contador de cada buque nunca retrocede. Las órdenes que ya no están quedan en lost_orders (RF-RES-06).
//  7. Época nueva (las apps reconstruyen su copia), todas las sesiones revocadas y la restauración en la bitácora.
import { AppError } from '@impocaribe/shared';
import { eq, inArray, isNull, sql } from 'drizzle-orm';
import { copyFile, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { recordAudit } from '../audit/audit-log.ts';
import { schemaVersion } from '../db/migrate.ts';
import { backups } from '../db/schema/backups.ts';
import { files, officialSignatures, officialStamps, systemSettings } from '../db/schema/company.ts';
import { devices } from '../db/schema/devices.ts';
import { loadOrders, loadOrderVersions, loadOrderVersionTrailers } from '../db/schema/orders.ts';
import { lostOrders, restores } from '../db/schema/restores.ts';
import { syncState } from '../db/schema/sync.ts';
import { sessions, users } from '../db/schema/users.ts';
import { vessels } from '../db/schema/vessels.ts';
import { runBackup, runPg, type BackupDeps, type BackupMeta } from './backup.ts';
import { decryptFile, openPrivateKey, readMeta, type SealedKey } from './crypto.ts';
import type { Maintenance } from './maintenance.ts';
import { unpack } from './pack.ts';

export interface RestoreDeps extends BackupDeps {
  maintenance: Maintenance;
  /** El respaldo previo; las pruebas lo cambian para simular una base que no se puede respaldar. */
  preRestore?: typeof runBackup;
}

export interface Actor {
  userId: string;
  sessionId: string;
  deviceId: string;
}

/** Lo que había justo antes de restaurar. */
async function readState(d: BackupDeps) {
  const db = d.db;
  const [settings] = await db.select().from(systemSettings);
  const orders = await db.select().from(loadOrders);
  const versions = await db.select().from(loadOrderVersions);
  const trailers = await db.select().from(loadOrderVersionTrailers);
  const ids = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  const signatureIds = ids(versions.map((v) => v.signatureId));
  const stampIds = ids(versions.map((v) => v.stampId));
  const signatures = signatureIds.length
    ? await db.select().from(officialSignatures).where(inArray(officialSignatures.id, signatureIds))
    : [];
  const stamps = stampIds.length
    ? await db.select().from(officialStamps).where(inArray(officialStamps.id, stampIds))
    : [];
  const fileIds = ids([
    ...versions.map((v) => v.pdfFileId),
    ...signatures.map((x) => x.fileId),
    ...stamps.map((x) => x.fileId),
  ]);
  return {
    signatures,
    stamps,
    settings: settings!,
    vessels: await db.select({ id: vessels.id, lastOrderSeq: vessels.lastOrderSeq }).from(vessels),
    orders,
    versions,
    trailers,
    files: fileIds.length ? await db.select().from(files).where(inArray(files.id, fileIds)) : [],
    backups: await db.select().from(backups),
    restores: await db.select().from(restores),
    lostOrders: await db.select().from(lostOrders),
    devices: await db.select().from(devices),
  };
}
type State = Awaited<ReturnType<typeof readState>>;

/** Copia a la carpeta de datos los archivos del respaldo que falten (se nombran por su SHA-256: no chocan). */
async function restoreFiles(from: string, dataDir: string) {
  const walk = async (dir: string, rel: string): Promise<void> => {
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      const src = join(dir, it.name);
      const target = join(dataDir, 'files', rel, it.name);
      if (it.isDirectory()) await walk(src, join(rel, it.name));
      else if (!(await stat(target).catch(() => null))) {
        await mkdir(join(dataDir, 'files', rel), { recursive: true });
        await copyFile(src, target);
      }
    }
  };
  await walk(join(from, 'files'), '');
}

export interface RestoreResult {
  restoreId: string;
  lostOrders: number;
  confirmationRequired: boolean;
}

export async function restoreBackup(
  d: RestoreDeps,
  input: { backupId: string; password: string },
  actor: Actor,
): Promise<RestoreResult> {
  const startedAt = d.clock.now();
  const [settings] = await d.db.select().from(systemSettings);
  if (!settings?.backupPrivateKey)
    throw new AppError('VALIDATION_ERROR', 'Todavía no hay contraseña de respaldo: no hay respaldos que restaurar.');
  const privateKey = await openPrivateKey(settings.backupPrivateKey as SealedKey, input.password);
  const [chosen] = await d.db.select().from(backups).where(eq(backups.id, input.backupId));
  if (!chosen || chosen.status !== 'ok' || !chosen.filePath)
    throw new AppError('NOT_FOUND', 'Ese respaldo no existe o su archivo ya no está en el servidor.');
  const file = join(d.dataDir, chosen.filePath);
  const meta = await readMeta<BackupMeta>(file);
  if (meta.schema !== schemaVersion())
    throw new AppError(
      'VALIDATION_ERROR',
      `Este respaldo es de otra versión del servidor (esquema ${meta.schema}; este usa el ${schemaVersion()}): no se puede restaurar aquí.`,
    );
  if (d.maintenance.active) throw new AppError('RESTORE_IN_PROGRESS', 'Ya hay una restauración en curso.');

  d.maintenance.active = true;
  const tmp = await mkdtemp(join(d.dataDir, 'restore-'));
  try {
    // 3. El estado de antes, para la numeración y las órdenes perdidas.
    let before: State | null = null;
    let preId: string | null = null;
    try {
      const pre = await (d.preRestore ?? runBackup)(d, 'pre_restore', actor.userId);
      if (pre?.status === 'ok') {
        preId = pre.id;
        before = await readState(d);
      }
    } catch {
      before = null;
    }

    // 4. La base y los archivos del respaldo elegido.
    await decryptFile(file, join(tmp, 'pack.bin'), privateKey);
    await unpack(join(tmp, 'pack.bin'), join(tmp, 'x'));
    await runPg(d.pgBin, 'pg_restore', d.maintenanceUrl, [
      '--clean',
      '--if-exists',
      '--single-transaction',
      '--exit-on-error',
      join(tmp, 'x', 'db.dump'),
    ]);
    await restoreFiles(join(tmp, 'x'), d.dataDir);

    // 5 a 7, en una transacción con la base ya restaurada.
    return await d.db.transaction(async (tx) => {
      const now = d.clock.now();
      if (before) {
        // Los usuarios son los del respaldo: quien ya no existe se quita de las referencias.
        const known = new Set((await tx.select({ id: users.id }).from(users)).map((u) => u.id));
        const who = (id: string | null) => (id && known.has(id) ? id : null);
        if (before.backups.length)
          await tx
            .insert(backups)
            .values(before.backups.map((b) => ({ ...b, createdBy: who(b.createdBy) })))
            .onConflictDoNothing();
        if (before.restores.length) await tx.insert(restores).values(before.restores).onConflictDoNothing();
        if (before.lostOrders.length)
          await tx
            .insert(lostOrders)
            .values(before.lostOrders.map((l) => ({ ...l, resolvedBy: who(l.resolvedBy) })))
            .onConflictDoNothing();
        for (const dev of before.devices) {
          const row = { ...dev, revokedBy: who(dev.revokedBy) };
          await tx.insert(devices).values(row).onConflictDoUpdate({ target: devices.id, set: row });
        }
        const s = before.settings;
        await tx.update(systemSettings).set({
          backupPublicKey: s.backupPublicKey,
          backupPrivateKey: s.backupPrivateKey,
          backupPasswordSetAt: s.backupPasswordSetAt,
          backupPasswordConfirmedAt: s.backupPasswordConfirmedAt,
          backupConfirmPostpones: s.backupConfirmPostpones,
          backupConfirmPostponedUntil: s.backupConfirmPostponedUntil,
        });
        // D12: el contador de cada buque continúa desde el mayor número emitido antes de restaurar.
        for (const v of before.vessels)
          await tx
            .update(vessels)
            .set({ lastOrderSeq: sql`GREATEST(${vessels.lastOrderSeq}, ${v.lastOrderSeq})` })
            .where(eq(vessels.id, v.id));
        // RF-RES-06: las órdenes que ya no están, con todas sus versiones y archivos, para recuperarlas.
        const present = new Set((await tx.select({ id: loadOrders.id }).from(loadOrders)).map((o) => o.id));
        const missing = before.orders.filter((o) => !present.has(o.id));
        const restoreId = await insertRestore(tx, chosen.id, preId, startedAt, missing.length, actor.userId);
        for (const o of missing) {
          const versions = before.versions.filter((v) => v.orderId === o.id);
          const versionIds = new Set(versions.map((v) => v.id));
          const sigs = before.signatures.filter((x) => versions.some((v) => v.signatureId === x.id));
          const stps = before.stamps.filter((x) => versions.some((v) => v.stampId === x.id));
          const fileIds = new Set([
            ...versions.map((v) => v.pdfFileId),
            ...sigs.map((x) => x.fileId),
            ...stps.map((x) => x.fileId),
          ]);
          await tx.insert(lostOrders).values({
            restoreId,
            orderId: o.id,
            vesselId: o.vesselId,
            number: o.number,
            seq: o.seq,
            payload: {
              order: o,
              versions,
              trailers: before.trailers.filter((t) => versionIds.has(t.versionId)),
              signatures: sigs,
              stamps: stps,
              files: before.files.filter((f) => fileIds.has(f.id)),
            },
            createdAt: now,
          });
        }
        const lost = missing.length;
        await finish(tx, now, actor, { backupId: chosen.id, restoreId, lostOrders: lost, confirmationRequired: false });
        return { restoreId, lostOrders: lost, confirmationRequired: false };
      }
      // T108: sin el estado de antes, no se emiten órdenes hasta confirmar el último número impreso de cada buque.
      await tx.update(systemSettings).set({ numberingConfirmationRequired: true });
      const restoreId = await insertRestore(tx, chosen.id, null, startedAt, 0, actor.userId);
      await finish(tx, now, actor, { backupId: chosen.id, restoreId, lostOrders: 0, confirmationRequired: true });
      return { restoreId, lostOrders: 0, confirmationRequired: true };
    });
  } catch (err) {
    await d.db
      .insert(restores)
      .values({
        backupId: chosen.id,
        status: 'failed',
        startedAt,
        finishedAt: d.clock.now(),
        error: err instanceof Error ? err.message : String(err),
        createdBy: actor.userId,
      })
      .catch(() => undefined);
    throw err instanceof AppError
      ? err
      : new AppError('INTERNAL_ERROR', 'No se pudo restaurar el respaldo: la base quedó como estaba.', {
          cause: err instanceof Error ? err.message : String(err),
        });
  } finally {
    d.maintenance.active = false;
    await rm(tmp, { recursive: true, force: true });
  }
}

type Tx = Parameters<Parameters<RestoreDeps['db']['transaction']>[0]>[0];

async function insertRestore(
  tx: Tx,
  backupId: string,
  preRestoreBackupId: string | null,
  startedAt: Date,
  lost: number,
  createdBy: string,
): Promise<string> {
  const [row] = await tx
    .insert(restores)
    .values({
      backupId,
      preRestoreBackupId,
      status: 'ok',
      startedAt,
      finishedAt: new Date(),
      lostOrders: lost,
      createdBy,
    })
    .returning({ id: restores.id });
  return row!.id;
}

/** 7. Época nueva, sesiones revocadas y la bitácora (la restaurada: la operación queda registrada en ella). */
async function finish(tx: Tx, now: Date, actor: Actor, after: Record<string, unknown>) {
  await tx.update(syncState).set({ epoch: sql`uuid_generate_v7()` });
  await tx.update(sessions).set({ revokedAt: now }).where(isNull(sessions.revokedAt));
  const known = await tx.select({ id: users.id }).from(users).where(eq(users.id, actor.userId));
  await recordAudit(
    tx,
    { now: () => now },
    {
      ...(known.length ? { userId: actor.userId } : {}),
      deviceId: actor.deviceId,
      action: 'backup.restore',
      entityType: 'backup',
      entityId: String(after.backupId),
      after,
    },
  );
}
