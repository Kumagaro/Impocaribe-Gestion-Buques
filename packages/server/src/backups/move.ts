// T130 · RF-INS-07, plan §10.5 y D14: el archivo de traslado (`.icmove`). Lleva el volcado de la base, la carpeta de
// archivos y la identidad del servidor (con sus claves, que en esta PC están protegidas por la máquina y en la nueva lo
// estarán por la suya), cifrado como los respaldos (crypto.ts). La clave privada sellada con la contraseña de respaldo
// va en la cabecera: en la PC nueva no hay base todavía, y con la contraseña basta para abrirlo. Al prepararlo, este
// servidor queda `migrated` y ya no arranca.
import { AppError, type Clock } from '@impocaribe/shared';
import { eq, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { recordAudit } from '../audit/audit-log.ts';
import { schemaVersion } from '../db/migrate.ts';
import { systemSettings } from '../db/schema/company.ts';
import { devices } from '../db/schema/devices.ts';
import { exportIdentity, importIdentity, type ExportedIdentity, type SecretProtector } from '../identity/identity.ts';
import { runPg } from './backup.ts';
import { decryptFile, encryptFile, openPrivateKey, readMeta, type SealedKey } from './crypto.ts';
import { entriesOf, pack, unpack } from './pack.ts';
import { restoreFiles } from './restore.ts';

export interface MoveMeta {
  kind: 'move';
  format: 1;
  /** La versión del esquema de la base trasladada: el servidor nuevo la lleva a la suya al migrar. */
  schema: number;
  createdAt: string;
  serverId: string;
  serverName: string;
  /** Los dispositivos emparejados, que se reconectarán solos (P-28 lo dice). */
  devices: number;
  sealedKey: SealedKey;
}

export interface MoveDeps {
  databaseUrl: string;
  /** Carpeta de pg_dump y pg_restore; vacía, los del PATH. */
  pgBin: string;
  dataDir: string;
  identityDir: string;
  protector: SecretProtector;
}

const NO_PASSWORD = () =>
  new AppError(
    'VALIDATION_ERROR',
    'Todavía no hay contraseña de respaldo: defínala en Respaldos y restauración antes de preparar el traslado.',
  );

/** En esta PC: crea el archivo de traslado en `dest` y deja este servidor `migrated` (D14). */
export async function prepareMove(
  d: MoveDeps & { db: NodePgDatabase; clock: Clock },
  input: { dest: string; password: string },
): Promise<MoveMeta> {
  const [settings] = await d.db.select().from(systemSettings);
  if (!settings?.backupPrivateKey || !settings.backupPublicKey) throw NO_PASSWORD();
  if (settings.serverState === 'migrated')
    throw new AppError('VALIDATION_ERROR', 'Este servidor ya se trasladó: no se puede volver a preparar.');
  const sealedKey = settings.backupPrivateKey as SealedKey;
  // La contraseña se comprueba antes de nada: sin ella, el archivo no se podría abrir en la PC nueva.
  await openPrivateKey(sealedKey, input.password);
  const identity = await exportIdentity(d.identityDir, d.protector);
  const { serverId, name } = JSON.parse(identity.meta) as { serverId: string; name: string };
  const [{ n }] = (await d.db
    .select({ n: sql<number>`count(*)::int` })
    .from(devices)
    .where(isNull(devices.revokedAt))) as [{ n: number }];

  const tmp = await mkdtemp(join(d.dataDir, 'traslado-'));
  try {
    await runPg(d.pgBin, 'pg_dump', d.databaseUrl, ['--format=custom', `--file=${join(tmp, 'db.dump')}`]);
    await writeFile(join(tmp, 'identity.json'), JSON.stringify(identity));
    await pack(
      [
        { name: 'db.dump', path: join(tmp, 'db.dump') },
        { name: 'identity.json', path: join(tmp, 'identity.json') },
        ...(await entriesOf(join(d.dataDir, 'files'), 'files')),
      ],
      join(tmp, 'pack.bin'),
    );
    const meta: MoveMeta = {
      kind: 'move',
      format: 1,
      schema: schemaVersion(),
      createdAt: d.clock.now().toISOString(),
      serverId,
      serverName: name,
      devices: n,
      sealedKey,
    };
    await encryptFile(join(tmp, 'pack.bin'), input.dest, settings.backupPublicKey, meta);
    // El volcado ya está hecho como `active`: el servidor nuevo arranca; este no.
    await d.db.transaction(async (tx) => {
      await tx.update(systemSettings).set({ serverState: 'migrated' }).where(eq(systemSettings.id, 1));
      await recordAudit(tx, d.clock, {
        action: 'server.move',
        entityType: 'server',
        after: { serverName: name, devices: n, file: input.dest },
      });
    });
    return meta;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** En la PC nueva, sin elevar (P-28): de qué servidor es el archivo, y si la contraseña lo abre. */
export async function readMove(file: string, password: string): Promise<MoveMeta> {
  const meta = await readMeta<MoveMeta>(file).catch(() => null);
  if (meta?.kind !== 'move')
    throw new AppError('VALIDATION_ERROR', 'Ese archivo no es un respaldo de traslado de Órdenes de Carga (.icmove).');
  await openPrivateKey(meta.sealedKey, password);
  if (meta.schema > schemaVersion())
    throw new AppError(
      'VALIDATION_ERROR',
      'El archivo es de una versión del servidor más nueva que este instalador: use el instalador de esa versión.',
    );
  return meta;
}

/** En la PC nueva (paso «estructura» del ayudante): la base, los archivos y la identidad del archivo de traslado. */
export async function restoreMove(d: MoveDeps, input: { file: string; password: string }): Promise<MoveMeta> {
  const meta = await readMove(input.file, input.password);
  const key = await openPrivateKey(meta.sealedKey, input.password);
  const tmp = await mkdtemp(join(d.dataDir, 'traslado-'));
  try {
    await decryptFile(input.file, join(tmp, 'pack.bin'), key);
    await unpack(join(tmp, 'pack.bin'), join(tmp, 'x'));
    await runPg(d.pgBin, 'pg_restore', d.databaseUrl, [
      '--single-transaction',
      '--exit-on-error',
      '--no-owner',
      join(tmp, 'x', 'db.dump'),
    ]);
    await restoreFiles(join(tmp, 'x'), d.dataDir);
    const identity = JSON.parse(await readFile(join(tmp, 'x', 'identity.json'), 'utf8')) as ExportedIdentity;
    await importIdentity(d.identityDir, identity, d.protector);
    return meta;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
