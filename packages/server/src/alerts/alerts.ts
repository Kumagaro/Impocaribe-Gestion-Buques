// T092 · RF-ALR-03, 05, plan §4.2: el motor de alertas. Las de evento se crean una vez y se atienden; las de condición
// se abren con su clave (no se repiten mientras están abiertas) y se resuelven solas cuando la condición desaparece.
// Cada cambio se replica a quien la ve, en la misma transacción que la causa.
import { ALERTS, type AlertType, type Clock } from '@impocaribe/shared';
import type { AlertDto } from '@impocaribe/shared/validation';
import { and, asc, eq, gt, inArray, isNotNull, notInArray, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Tx } from '../audit/audit-log.ts';
import { alerts } from '../db/schema/alerts.ts';
import { users } from '../db/schema/users.ts';
import { recordChanges, type Change } from '../sync/change-log.ts';

export interface AlertInput {
  type: AlertType;
  title: string;
  detail: string;
  entity?: { type: string; id: string };
  payload?: Record<string, unknown>;
  /** AL-08: el autor, que la ve además de los roles. */
  targetUserId?: string;
}

/** RF-ALR-05: la audiencia de sincronización de cada alerta, según quién la ve. */
export function alertAudiences(a: { type: string; targetUserId: string | null }): string[] {
  const see = ALERTS[a.type as AlertType].see as readonly string[];
  const role = see.includes('lectura') ? 'all' : see.includes('operador') ? 'editors' : 'apoderada';
  return a.targetUserId ? [role, `user:${a.targetUserId}`] : [role];
}

const values = (clock: Clock, a: AlertInput, dedupeKey: string | null) => ({
  type: a.type,
  kind: ALERTS[a.type].kind as 'condition' | 'event',
  dedupeKey,
  audienceRoles: [...ALERTS[a.type].see],
  targetUserId: a.targetUserId ?? null,
  entityType: a.entity?.type ?? null,
  entityId: a.entity?.id ?? null,
  title: a.title,
  detail: a.detail,
  payload: a.payload ?? null,
  createdAt: clock.now(),
});

/** Una alerta de evento (ocurre una vez). Devuelve su id. */
export async function raiseEvent(tx: Tx, clock: Clock, a: AlertInput): Promise<string> {
  const [row] = await tx
    .insert(alerts)
    .values(values(clock, a, null))
    .returning({ id: alerts.id });
  await replicateAlerts(tx, clock, [row!.id]);
  return row!.id;
}

/** Abre una de condición si no estaba abierta con esa clave. Devuelve su id si la abrió. */
export async function openCondition(tx: Tx, clock: Clock, key: string, a: AlertInput): Promise<string | null> {
  const [row] = await tx
    .insert(alerts)
    .values(values(clock, a, key))
    .onConflictDoNothing({ target: alerts.dedupeKey, where: eqOpen })
    .returning({ id: alerts.id });
  return row?.id ?? null;
}

const eqOpen = eq(alerts.status, 'open');

/** Resuelve las de condición de `types` abiertas cuya clave ya no está en `keep`. Devuelve sus ids. */
export async function resolveMissing(tx: Tx, clock: Clock, types: AlertType[], keep: string[]): Promise<string[]> {
  const rows = await tx
    .update(alerts)
    .set({ status: 'resolved', resolvedAt: clock.now() })
    .where(
      and(
        inArray(alerts.type, types),
        eqOpen,
        isNotNull(alerts.dedupeKey),
        keep.length ? notInArray(alerts.dedupeKey, keep) : undefined,
      ),
    )
    .returning({ id: alerts.id });
  return rows.map((r) => r.id);
}

const attendants = alias(users, 'attendants');

export async function readAlerts(
  tx: Tx,
  f: { ids?: string[]; after?: string | null; limit?: number; where?: SQL } = {},
) {
  const rows = await tx
    .select({ a: alerts, attendedByName: attendants.fullName })
    .from(alerts)
    .leftJoin(attendants, eq(attendants.id, alerts.attendedBy))
    .where(and(f.ids ? inArray(alerts.id, f.ids) : undefined, f.after ? gt(alerts.id, f.after) : undefined, f.where))
    .orderBy(asc(alerts.id))
    .limit(f.limit ?? 100_000);
  return rows.map(({ a, attendedByName }): AlertDto => ({
    id: a.id,
    type: a.type,
    kind: a.kind,
    title: a.title,
    detail: a.detail,
    entityType: a.entityType,
    entityId: a.entityId,
    targetUserId: a.targetUserId,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
    attendedByName,
    attendedAt: a.attendedAt?.toISOString() ?? null,
  }));
}

/** Plan §4.4: el DTO de cada alerta a cada audiencia que la ve. */
export async function replicateAlerts(tx: Tx, clock: Clock, ids: string[]) {
  if (ids.length === 0) return;
  const changes: Change[] = [];
  for (const dto of await readAlerts(tx, { ids }))
    for (const audience of alertAudiences({ type: dto.type, targetUserId: dto.targetUserId }))
      changes.push({
        entityType: 'alert',
        entityId: dto.id,
        op: 'upsert',
        audience,
        payload: dto,
        refDate: dto.createdAt.slice(0, 10),
      });
  await recordChanges(tx, clock, changes);
}
