import { createHash } from 'node:crypto';
import { AppError, type Clock } from '@impocaribe/shared';
import { and, eq, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Request } from 'express';
import type { Tx } from '../audit/audit-log.ts';
import { idempotencyKeys } from '../db/schema/idempotency.ts';

const TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyRequest {
  deviceId: string;
  key: string;
  method: string;
  path: string;
  body: string;
}

export interface WriteResult {
  status: number;
  body: unknown;
}

/** Datos de idempotencia de una petición de escritura (DT-22): dispositivo, clave, método, ruta y cuerpo tal cual llegó. */
export function idempotencyRequest(req: Request & { rawBody?: Buffer }): IdempotencyRequest {
  return {
    // Hasta el emparejamiento (T035) puede faltar el dispositivo; las claves son UUID, así que no chocan.
    deviceId: req.header('x-device-id') ?? '',
    // El middleware de configureApp ya exige la cabecera en toda escritura.
    key: req.header('idempotency-key')!,
    method: req.method,
    path: req.originalUrl,
    body: req.rawBody?.toString('utf8') ?? '',
  };
}

/** Campos que nunca entran al hash guardado: con un hash simple del cuerpo se podría adivinar la contraseña. */
const SECRETS = new Set(['password', 'confirm', 'current', 'code', 'temporaryPassword']);

/** El cuerpo sin los secretos: el mismo intento con otro secreto se trata como repetición, que es lo prudente. */
function withoutSecrets(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return body;
  return JSON.stringify(Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, SECRETS.has(k) ? '*' : v])));
}

function requestHash(r: IdempotencyRequest): string {
  return createHash('sha256')
    .update(`${r.method}\n${r.path}\n${withoutSecrets(r.body)}`)
    .digest('hex');
}

/**
 * DT-22 · D15: ejecuta la escritura una sola vez por (dispositivo, clave). El resultado se guarda en la misma transacción
 * que el efecto; una repetición, aunque llegue en paralelo, espera a que la primera confirme y devuelve su resultado.
 * La misma clave con otro contenido responde IDEMPOTENCY_MISMATCH.
 */
export async function withIdempotency(
  db: NodePgDatabase,
  clock: Clock,
  request: IdempotencyRequest,
  fn: (tx: Tx) => Promise<WriteResult>,
): Promise<WriteResult> {
  const hash = requestHash(request);
  const id = and(eq(idempotencyKeys.deviceId, request.deviceId), eq(idempotencyKeys.key, request.key));
  return db.transaction(async (tx) => {
    const now = clock.now();
    const claim = () =>
      tx
        .insert(idempotencyKeys)
        .values({
          deviceId: request.deviceId,
          key: request.key,
          method: request.method,
          path: request.path,
          requestHash: hash,
          createdAt: now,
          expiresAt: new Date(now.getTime() + TTL_MS),
        })
        .onConflictDoNothing()
        .returning({ key: idempotencyKeys.key });

    // Si otra transacción tiene la misma clave sin confirmar, el INSERT espera a que termine.
    if ((await claim()).length === 0) {
      const [previous] = await tx.select().from(idempotencyKeys).where(id);
      if (previous!.expiresAt > now) {
        if (previous!.requestHash !== hash) {
          throw new AppError(
            'IDEMPOTENCY_MISMATCH',
            'Esta petición reutiliza la clave de un intento anterior con otro contenido. Vuelva a intentarlo como una operación nueva.',
          );
        }
        return { status: previous!.statusCode!, body: previous!.response };
      }
      // Vencida y aún sin depurar: cuenta como un intento nuevo.
      await tx.delete(idempotencyKeys).where(id);
      await claim();
    }
    const result = await fn(tx);
    await tx.update(idempotencyKeys).set({ statusCode: result.status, response: result.body }).where(id);
    return result;
  });
}

/** Depura las claves vencidas (plan §4.2: cada hora). Devuelve cuántas borró. */
export async function purgeExpiredIdempotencyKeys(db: NodePgDatabase, clock: Clock): Promise<number> {
  const deleted = await db
    .delete(idempotencyKeys)
    .where(lte(idempotencyKeys.expiresAt, clock.now()))
    .returning({ key: idempotencyKeys.key });
  return deleted.length;
}
