// T050 · plan §4.2 (files): el binario va en la carpeta de datos, con el nombre de su SHA-256; la fila guarda la huella,
// el tipo, el tamaño y la ruta relativa. La misma imagen subida dos veces ocupa un solo archivo en disco.
import type { Clock } from '@impocaribe/shared';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Tx } from '../audit/audit-log.ts';
import { files } from '../db/schema/company.ts';

/**
 * Escribe el archivo (si no estaba ya) y registra su fila en la transacción. Se escribe antes de confirmar: si la
 * transacción se revierte queda un archivo sin fila, inofensivo porque su nombre es su contenido.
 */
export async function storeFile(tx: Tx, clock: Clock, dataDir: string, bytes: Uint8Array, mime: string) {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const storagePath = `files/${sha256.slice(0, 2)}/${sha256}`;
  const target = join(dataDir, storagePath);
  if (!(await exists(target))) {
    await mkdir(dirname(target), { recursive: true });
    // Primero a un temporal y luego se renombra: nunca queda a medias un archivo con el nombre definitivo.
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, bytes);
    await rename(temp, target);
  }
  const [row] = await tx
    .insert(files)
    .values({ sha256, mime, sizeBytes: bytes.length, storagePath, createdAt: clock.now() })
    .returning({ id: files.id });
  return row!.id;
}

export async function readStoredFile(db: NodePgDatabase | Tx, dataDir: string, id: string) {
  const [row] = await db.select().from(files).where(eq(files.id, id));
  if (!row) throw new Error(`El archivo ${id} no existe.`);
  return { mime: row.mime, bytes: await readFile(join(dataDir, row.storagePath)) };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
