// T029 · plan §9: token aleatorio de 256 bits guardado como hash; duración absoluta de 24 h o 30 días (RF-AUT-02).
import type { Clock } from '@impocaribe/shared';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import type { Tx } from '../audit/audit-log.ts';
import { sessions } from '../db/schema/users.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
export const sessionDuration = (keepSignedIn: boolean) => (keepSignedIn ? 30 : 1) * DAY_MS;
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface NewSession {
  userId: string;
  kind: 'app' | 'device';
  deviceId: string;
  deviceLabel: string;
  platform: 'windows' | 'android';
  keepSignedIn: boolean;
}

/** Abre una sesión y devuelve el token en claro: es la única vez que existe fuera del dispositivo. */
export async function createSession(tx: Tx, clock: Clock, input: NewSession) {
  const now = clock.now();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + sessionDuration(input.keepSignedIn));
  const [row] = await tx
    .insert(sessions)
    .values({ ...input, tokenHash: hashToken(token), createdAt: now, expiresAt, lastSeenAt: now })
    .returning({ id: sessions.id });
  return { id: row!.id, token, expiresAt };
}

/**
 * RF-AUT-04 y 10: cierra todas las sesiones vigentes de un usuario (al cambiar el rol o la contraseña, al desactivarlo
 * o al revocar su dispositivo), salvo la indicada. Devuelve las sesiones cerradas.
 */
export async function revokeUserSessions(tx: Tx, clock: Clock, userId: string, exceptSessionId?: string) {
  const now = clock.now();
  return tx
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
        exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
      ),
    )
    .returning({ id: sessions.id });
}
