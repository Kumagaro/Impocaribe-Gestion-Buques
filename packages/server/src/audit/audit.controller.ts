// T104 · RF-BIT-02, 03, plan §6.2 (GET /audit): la bitácora para todos los roles, filtrada por usuario, fechas de La
// Habana, grupo de acciones y DM u orden, de la más reciente a la más antigua y por páginas. Solo lectura.
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { AUDIT_GROUP_PREFIXES } from '@impocaribe/shared';
import { AUDIT_PAGE, auditPageSchema, auditQuerySchema, type AuditPage } from '@impocaribe/shared/validation';
import { and, desc, eq, inArray, like, lt, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';
import { ALL_ROLES } from '../auth/auth.controller.ts';
import { auditLog } from '../db/schema/audit.ts';
import { devices } from '../db/schema/devices.ts';
import { loadOrders } from '../db/schema/orders.ts';
import { users } from '../db/schema/users.ts';
import { customsDeclarations, vessels } from '../db/schema/vessels.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { DB } from '../tokens.ts';
import type { Tx } from './audit-log.ts';

const actors = alias(users, 'actors');
const subjects = alias(users, 'subjects');
const havanaDay = sql`(${auditLog.at} AT TIME ZONE 'America/Havana')::date`;

/** Las entidades que nombra `ref`: la orden por su número completo o su parte final, y la DM por su número. */
async function entitiesOf(tx: Tx, ref: string): Promise<string[]> {
  const digits = /^\d+$/.test(ref) ? ref : null;
  const orders = await tx
    .select({ id: loadOrders.id })
    .from(loadOrders)
    .where(
      or(
        eq(loadOrders.number, ref),
        digits && digits.length <= 4 ? like(loadOrders.number, `%-${digits.padStart(4, '0')}`) : undefined,
      ),
    );
  const declarations =
    digits && digits.length <= 5
      ? await tx
          .select({ id: customsDeclarations.id })
          .from(customsDeclarations)
          .where(eq(customsDeclarations.number, digits.padStart(5, '0')))
      : [];
  return [...orders, ...declarations].map((r) => r.id);
}

@Controller('audit')
export class AuditController {
  constructor(@Inject(DB) private readonly db: NodePgDatabase) {}

  @Get()
  @Contract({ output: auditPageSchema, roles: ALL_ROLES })
  list(@Query(new ZodValidationPipe(auditQuerySchema)) q: z.output<typeof auditQuerySchema>): Promise<AuditPage> {
    return this.db.transaction(
      async (tx) => {
        const filters: (SQL | undefined)[] = [
          q.userId ? eq(auditLog.userId, q.userId) : undefined,
          q.from ? sql`${havanaDay} >= ${q.from}` : undefined,
          q.to ? sql`${havanaDay} <= ${q.to}` : undefined,
          q.group ? or(...AUDIT_GROUP_PREFIXES[q.group].map((p) => like(auditLog.action, `${p}%`))) : undefined,
          q.before ? lt(auditLog.id, q.before) : undefined,
        ];
        if (q.ref) {
          const ids = await entitiesOf(tx, q.ref);
          if (ids.length === 0) return { entries: [], next: null };
          filters.push(inArray(auditLog.entityId, ids));
        }
        const rows = await tx
          .select({
            log: auditLog,
            userName: actors.fullName,
            deviceName: devices.name,
            orderNumber: loadOrders.number,
            declarationNumber: customsDeclarations.number,
            vesselName: vessels.name,
            subjectName: subjects.fullName,
          })
          .from(auditLog)
          .leftJoin(actors, eq(actors.id, auditLog.userId))
          .leftJoin(devices, eq(devices.id, auditLog.deviceId))
          .leftJoin(
            loadOrders,
            and(eq(auditLog.entityType, 'order'), eq(sql`${loadOrders.id}::text`, auditLog.entityId)),
          )
          .leftJoin(
            customsDeclarations,
            and(eq(auditLog.entityType, 'declaration'), eq(sql`${customsDeclarations.id}::text`, auditLog.entityId)),
          )
          .leftJoin(vessels, and(eq(auditLog.entityType, 'vessel'), eq(sql`${vessels.id}::text`, auditLog.entityId)))
          .leftJoin(subjects, and(eq(auditLog.entityType, 'user'), eq(sql`${subjects.id}::text`, auditLog.entityId)))
          .where(and(...filters))
          .orderBy(desc(auditLog.id))
          .limit(AUDIT_PAGE + 1);
        const page = rows.slice(0, AUDIT_PAGE);
        return {
          entries: page.map((r) => ({
            id: r.log.id,
            at: r.log.at.toISOString(),
            userName: r.userName,
            deviceName: r.deviceName,
            action: r.log.action,
            entityType: r.log.entityType,
            entityId: r.log.entityId,
            entityLabel:
              r.orderNumber ??
              (r.declarationNumber ? `DM ${r.declarationNumber}` : null) ??
              r.vesselName ??
              r.subjectName,
            before: r.log.before,
            after: r.log.after,
            reason: r.log.reason,
            ok: r.log.ok,
          })),
          next: rows.length > AUDIT_PAGE ? page.at(-1)!.log.id : null,
        };
      },
      { accessMode: 'read only' },
    );
  }
}
