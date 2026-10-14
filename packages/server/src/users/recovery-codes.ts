// RF-REC-01 y 03: 8 códigos de un solo uso, que se muestran una vez. Se guardan como hash argon2id; un juego nuevo
// invalida el anterior.
import type { Clock } from '@impocaribe/shared';
import { RECOVERY_CODE_ALPHABET } from '@impocaribe/shared/validation';
import { and, eq, isNull } from 'drizzle-orm';
import { randomInt, randomUUID } from 'node:crypto';
import type { Tx } from '../audit/audit-log.ts';
import { hashSecret } from '../auth/password.ts';
import { recoveryCodes } from '../db/schema/users.ts';

export const RECOVERY_CODE_COUNT = 8;

function generateCode(): string {
  const chars = Array.from({ length: 8 }, () => RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/** Emite un juego nuevo y devuelve los códigos en claro (la única vez que existen así). */
export async function issueRecoveryCodes(tx: Tx, clock: Clock, userId: string): Promise<string[]> {
  const now = clock.now();
  await tx
    .update(recoveryCodes)
    .set({ invalidatedAt: now })
    .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.invalidatedAt)));
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) codes.add(generateCode());
  const batchId = randomUUID();
  // Uno tras otro: cada hash argon2id usa 64 MB y el servidor debe caber en 4 GB (RNF-21).
  const rows = [];
  for (const code of codes) rows.push({ userId, batchId, codeHash: await hashSecret(code), createdAt: now });
  await tx.insert(recoveryCodes).values(rows);
  return [...codes];
}
