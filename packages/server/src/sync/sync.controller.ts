// T042 · plan §5.9 y §6.2 (Sincronización): estado, cambios incrementales e instantánea, filtrados por la audiencia del
// rol (plan §4.4). RF-CON-02, 03, 09 y 10.
import {
  Controller,
  Get,
  Inject,
  Injectable,
  Logger,
  Query,
  Req,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppError, type Clock, type Role } from '@impocaribe/shared';
import {
  syncChangesQuerySchema,
  syncChangesResponseSchema,
  syncSnapshotQuerySchema,
  syncSnapshotResponseSchema,
  syncStateSchema,
  type SyncEntity,
} from '@impocaribe/shared/validation';
import { and, asc, eq, gt, inArray, lt, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';
import type { Tx } from '../audit/audit-log.ts';
import { ALL_ROLES } from '../auth/auth.controller.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { devices } from '../db/schema/devices.ts';
import { changeLog, syncState } from '../db/schema/sync.ts';
import { sessions, users } from '../db/schema/users.ts';
import { CATALOG_ENTITIES, loadCatalog } from '../catalogs/catalogs.repo.ts';
import { loadDeclarations, loadVessels } from '../vessels/vessels.repo.ts';
import { readDrafts, readOrders } from '../orders/orders.repo.ts';
import { Contract } from '../http/contract.ts';
import type { DeviceRequest } from '../http/device.guard.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { userColumns } from '../users/users.repo.ts';
import { CLOCK, DB } from '../tokens.ts';

/** Plan §6.2: registros por página de la instantánea. */
export const SNAPSHOT_PAGE = 2000;
/** Plan §4.4: el registro de cambios guarda 30 días; quien lleva más sin sincronizar reconstruye su copia (RF-CON-09). */
export const CHANGE_LOG_DAYS = 30;
const DAY_MS = 86_400_000;

/** Las audiencias que ve una sesión (plan §4.4): todos, editores (A y O), Apoderada y lo suyo. */
export function audiencesFor(role: Role, userId: string): string[] {
  return [
    'all',
    ...(role === 'lectura' ? [] : ['editors']),
    ...(role === 'apoderada' ? ['apoderada'] : []),
    `user:${userId}`,
  ];
}

interface SnapshotRow {
  id: string;
  payload: unknown;
  refDate: string | null;
}
/** De dónde sale cada entidad en la instantánea, con el mismo DTO que publica el registro de cambios. */
interface SnapshotSource {
  entityType: SyncEntity;
  /** `self`: lo de la propia sesión (borradores privados); `page` recibe el usuario. */
  audience: string;
  page(tx: Tx, after: string | null, limit: number, userId: string): Promise<SnapshotRow[]>;
}

const SOURCES: SnapshotSource[] = [
  {
    entityType: 'user_directory',
    audience: 'all',
    async page(tx, after, limit) {
      const rows = await tx
        .select({ id: users.id, fullName: users.fullName, role: users.role, active: users.active })
        .from(users)
        .where(after ? gt(users.id, after) : undefined)
        .orderBy(asc(users.id))
        .limit(limit);
      return rows.map((r) => ({ id: r.id, payload: r, refDate: null }));
    },
  },
  {
    entityType: 'user_admin',
    audience: 'apoderada',
    async page(tx, after, limit) {
      const rows = await tx
        .select({
          ...userColumns,
          lastAccessAt: sql<Date | null>`max(${sessions.lastSeenAt})`.mapWith((v) => (v ? new Date(v) : null)),
        })
        .from(users)
        .leftJoin(sessions, eq(sessions.userId, users.id))
        .where(after ? gt(users.id, after) : undefined)
        .groupBy(users.id)
        .orderBy(asc(users.id))
        .limit(limit);
      return rows.map((r) => ({
        id: r.id,
        payload: { ...r, lastAccessAt: r.lastAccessAt ? r.lastAccessAt.toISOString() : null },
        refDate: null,
      }));
    },
  },
  // T056: los catálogos, para todos (plan §4.4).
  ...CATALOG_ENTITIES.map((entity): SnapshotSource => ({
    entityType: entity,
    audience: 'all',
    async page(tx, after, limit) {
      const rows = await loadCatalog(tx, entity, { after, limit });
      return rows.map((r) => ({ id: r.id, payload: r, refDate: null }));
    },
  })),
  // T066: buques y DM con sus saldos, para todos (plan §4.4).
  {
    entityType: 'vessel',
    audience: 'all',
    async page(tx, after, limit) {
      const rows = await loadVessels(tx, { after, limit });
      return rows.map((r) => ({ id: r.id, payload: r, refDate: r.arrivalDate ?? r.etaDate }));
    },
  },
  {
    entityType: 'declaration',
    audience: 'all',
    async page(tx, after, limit) {
      const rows = await loadDeclarations(tx, { after, limit });
      return rows.map((r) => ({ id: r.id, payload: r, refDate: r.deadlineStartDate }));
    },
  },
  // T079 y T076: las órdenes para todos; los borradores compartidos para los editores y los privados para su autor.
  {
    entityType: 'order',
    audience: 'all',
    async page(tx, after, limit) {
      const rows = await readOrders(tx, { after, limit });
      return rows.map((r) => ({ id: r.id, payload: r, refDate: r.current.loadingDate }));
    },
  },
  {
    entityType: 'draft',
    audience: 'editors',
    async page(tx, after, limit) {
      const rows = await readDrafts(tx, { after, limit, visibility: 'shared' });
      return rows.map((r) => ({ id: r.id, payload: r, refDate: null }));
    },
  },
  {
    entityType: 'draft',
    audience: 'self',
    async page(tx, after, limit, userId) {
      const rows = await readDrafts(tx, { after, limit, visibility: 'private', ownerId: userId });
      return rows.map((r) => ({ id: r.id, payload: r, refDate: null }));
    },
  },
];

const resync = () =>
  new AppError('RESYNC_REQUIRED', 'La copia local de este dispositivo está desactualizada: se va a reconstruir.');
const badCursor = () =>
  new AppError('VALIDATION_ERROR', 'Hay 1 campo por corregir.', { fields: { cursor: 'El cursor no es válido.' } });

interface Cursor {
  source: number;
  after: string | null;
}
const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');
function decodeCursor(raw: string | undefined, sources: number): Cursor {
  if (raw === undefined) return { source: 0, after: null };
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    const okAfter = c.after === null || /^[0-9a-f-]{36}$/.test(String(c.after));
    if (Number.isInteger(c.source) && c.source >= 0 && c.source < sources && okAfter) return c;
  } catch {
    // Cae al error de abajo.
  }
  throw badCursor();
}

/** Borra del registro lo que tiene más de 30 días (plan §4.4). Devuelve cuántos cambios borró. */
export async function purgeChangeLog(db: NodePgDatabase, clock: Clock): Promise<number> {
  const limit = new Date(clock.now().getTime() - CHANGE_LOG_DAYS * DAY_MS);
  const deleted = await db.delete(changeLog).where(lt(changeLog.committedAt, limit)).returning({ seq: changeLog.seq });
  return deleted.length;
}

@Controller('sync')
export class SyncController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * RF-CON-10: mide el desfase de la hora del dispositivo (X-Device-Time − hora del servidor) y lo guarda para la firma
   * (DT-24). Es la única ruta que la guarda de dispositivo admite fuera de la ventana de ±5 min.
   */
  @Get('state')
  @Contract({ output: syncStateSchema, roles: ALL_ROLES, whileMustChangePassword: true })
  async state(@Req() req: AuthedRequest): Promise<z.infer<typeof syncStateSchema>> {
    const now = this.clock.now();
    const deviceTime = Number(req.header('x-device-time'));
    const deviceId = (req as DeviceRequest).device?.id;
    if (deviceId && Number.isFinite(deviceTime)) {
      await this.db
        .update(devices)
        .set({ clockOffsetMs: deviceTime - now.getTime() })
        .where(eq(devices.id, deviceId));
    }
    const [state] = await this.db.select().from(syncState);
    return {
      epoch: state!.epoch,
      lastSeq: state!.lastSeq,
      schemaVersion: state!.schemaVersion,
      serverTime: now.toISOString(),
    };
  }

  /** RF-CON-03: los cambios desde `since`, en orden, solo los de su audiencia. */
  @Get('changes')
  @Contract({
    output: syncChangesResponseSchema,
    errors: ['RESYNC_REQUIRED'],
    roles: ALL_ROLES,
    whileMustChangePassword: true,
  })
  async changes(
    @Req() req: AuthedRequest,
    @Query(new ZodValidationPipe(syncChangesQuerySchema)) query: z.output<typeof syncChangesQuerySchema>,
  ): Promise<z.infer<typeof syncChangesResponseSchema>> {
    const { since, limit } = query;
    const [state] = await this.db.select({ lastSeq: syncState.lastSeq }).from(syncState);
    const last = state!.lastSeq;
    if (since > last) throw resync();
    if (since < last) {
      // Si el siguiente que necesita ya se depuró, su copia no puede ponerse al día cambio a cambio (RF-CON-09).
      const [oldest] = await this.db
        .select({ seq: sql<number>`min(${changeLog.seq})`.mapWith(Number) })
        .from(changeLog);
      if (!oldest?.seq || oldest.seq > since + 1) throw resync();
    }
    const rows = await this.db
      .select()
      .from(changeLog)
      .where(
        and(
          gt(changeLog.seq, since),
          lte(changeLog.seq, last),
          inArray(changeLog.audience, audiencesFor(req.auth.role, req.auth.userId)),
        ),
      )
      .orderBy(asc(changeLog.seq))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      changes: page.map((r) => ({
        seq: r.seq,
        entityType: r.entityType as SyncEntity,
        entityId: r.entityId,
        op: r.op,
        payload: r.payload,
        refDate: r.refDate,
      })),
      nextSince: hasMore ? page.at(-1)!.seq : last,
      hasMore,
    };
  }

  /**
   * RF-CON-02: la copia completa de lo que su rol puede ver, por páginas. Cada página se lee en una sola instantánea de
   * la base; la app sigue después con los cambios desde el `seq` de la primera página, así que converge aunque entre
   * página y página haya habido escrituras.
   */
  @Get('snapshot')
  @Contract({ output: syncSnapshotResponseSchema, roles: ALL_ROLES, whileMustChangePassword: true })
  async snapshot(
    @Req() req: AuthedRequest,
    @Query(new ZodValidationPipe(syncSnapshotQuerySchema)) query: z.output<typeof syncSnapshotQuerySchema>,
  ): Promise<z.infer<typeof syncSnapshotResponseSchema>> {
    const audiences = audiencesFor(req.auth.role, req.auth.userId);
    const visible = SOURCES.filter((s) => s.audience === 'self' || audiences.includes(s.audience));
    let cursor = decodeCursor(query.cursor, visible.length);
    return this.db.transaction(
      async (tx) => {
        const [state] = await tx.select().from(syncState);
        const records: z.infer<typeof syncSnapshotResponseSchema>['records'] = [];
        while (cursor.source < visible.length && records.length < SNAPSHOT_PAGE) {
          const source = visible[cursor.source]!;
          const limit = SNAPSHOT_PAGE - records.length;
          const rows = await source.page(tx, cursor.after, limit, req.auth.userId);
          records.push(
            ...rows.map((r) => ({
              entityType: source.entityType,
              entityId: r.id,
              payload: r.payload,
              refDate: r.refDate,
            })),
          );
          cursor =
            rows.length < limit ? { source: cursor.source + 1, after: null } : { ...cursor, after: rows.at(-1)!.id };
        }
        return {
          epoch: state!.epoch,
          seq: state!.lastSeq,
          records,
          nextCursor: cursor.source < visible.length ? encodeCursor(cursor) : null,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}

/** Plan §4.4: depura el registro de cambios al arrancar y una vez al día. */
@Injectable()
export class ChangeLogPurge implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    const run = () =>
      void purgeChangeLog(this.db, this.clock).catch((err: unknown) =>
        new Logger('ChangeLogPurge').error(`No se pudo depurar el registro de cambios: ${String(err)}`),
      );
    run();
    this.timer = setInterval(run, DAY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }
}
