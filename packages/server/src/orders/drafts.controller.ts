// T076 · RF-ORD-06 a 11, D9, plan §5.8 y §6.2 (Borradores). Un borrador privado solo lo ve y edita su autor; uno
// compartido lo ven Apoderadas y Operadores y lo edita quien tiene el bloqueo, que se renueva con un latido y vence a
// los 10 minutos sin actividad. Una Apoderada puede liberarlo antes. Los borradores no reservan saldo (RF-ORD-10).
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { AppError, type Clock } from '@impocaribe/shared';
import { draftDtoSchema, draftPayloadSchema, saveDraftSchema, syncDraftsSchema } from '@impocaribe/shared/validation';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'express';
import { z } from 'zod';
import type { Tx } from '../audit/audit-log.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { drafts } from '../db/schema/orders.ts';
import { users } from '../db/schema/users.ts';
import { auditedWrite } from '../http/audited-write.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DB } from '../tokens.ts';
import { EDITORS } from '../vessels/declarations.controller.ts';
import { readDrafts, replicateOrders } from './orders.repo.ts';

const LOCK_MS = 10 * 60_000;
const scopeSchema = z.object({ scope: z.enum(['mine', 'shared']).default('mine') });
const editSchema = z.object({ payload: draftPayloadSchema });

@Controller('drafts')
export class DraftsController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  @Contract({ output: z.array(draftDtoSchema), roles: EDITORS })
  list(@Req() req: AuthedRequest, @Query(new ZodValidationPipe(scopeSchema)) q: z.output<typeof scopeSchema>) {
    return this.db.transaction((tx) =>
      readDrafts(
        tx,
        q.scope === 'shared' ? { visibility: 'shared' } : { visibility: 'private', ownerId: req.auth.userId },
      ),
    );
  }

  /** RF-ORD-07: guardar (idempotente por `clientDraftId`): crea, o actualiza el del mismo autor. */
  @Post()
  @Contract({ input: saveDraftSchema, output: draftDtoSchema, errors: ['DRAFT_LOCKED'], roles: EDITORS })
  async save(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(saveDraftSchema)) input: z.output<typeof saveDraftSchema>,
  ) {
    await this.write(req, res, 'draft.save', async (tx) => {
      const [found] = await tx.select().from(drafts).where(eq(drafts.clientDraftId, input.clientDraftId)).for('update');
      if (found) {
        await assertCanEdit(tx, this.clock, req.auth.userId, found);
        await tx
          .update(drafts)
          .set({
            payload: input.payload,
            updatedAt: this.clock.now(),
            ...(input.visibility === 'shared' && found.visibility === 'private'
              ? { visibility: 'shared' as const, sharedAt: this.clock.now() }
              : {}),
          })
          .where(eq(drafts.id, found.id));
        return found.id;
      }
      const [d] = await tx
        .insert(drafts)
        .values({
          clientDraftId: input.clientDraftId,
          ownerId: req.auth.userId,
          visibility: input.visibility,
          payload: input.payload,
          ...(input.visibility === 'shared' ? { sharedAt: this.clock.now() } : {}),
          updatedAt: this.clock.now(),
        })
        .returning({ id: drafts.id });
      return d!.id;
    });
  }

  /** RF-ORD-08: al reconectar, los borradores locales suben como privados de su autor (idempotente). */
  @Post('sync')
  @HttpCode(200)
  @Contract({ input: syncDraftsSchema, output: z.array(draftDtoSchema), roles: EDITORS })
  async sync(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(syncDraftsSchema)) input: z.output<typeof syncDraftsSchema>,
  ) {
    const result = await auditedWrite(
      this.db,
      this.clock,
      req,
      { userId: req.auth.userId, sessionId: req.auth.sessionId, deviceId: req.auth.deviceId, action: 'draft.sync' },
      async (tx) => {
        const ids: string[] = [];
        for (const d of input.drafts) {
          const [found] = await tx.select().from(drafts).where(eq(drafts.clientDraftId, d.clientDraftId));
          if (found) {
            // Ya subido: si es suyo y sigue privado, se actualiza; si no, se respeta lo que hay en el servidor.
            if (found.ownerId === req.auth.userId && found.visibility === 'private' && !found.issuedOrderId)
              await tx
                .update(drafts)
                .set({ payload: d.payload, updatedAt: this.clock.now() })
                .where(eq(drafts.id, found.id));
            ids.push(found.id);
            continue;
          }
          const [row] = await tx
            .insert(drafts)
            .values({
              clientDraftId: d.clientDraftId,
              ownerId: req.auth.userId,
              visibility: 'private',
              payload: d.payload,
              updatedAt: this.clock.now(),
            })
            .returning({ id: drafts.id });
          ids.push(row!.id);
        }
        await replicateOrders(tx, this.clock, { drafts: ids });
        return { status: 200, body: await readDrafts(tx, { ids, includeClosed: true }), after: { count: ids.length } };
      },
    );
    res.status(result.status).json(result.body);
  }

  @Patch(':id')
  @Contract({ input: editSchema, output: draftDtoSchema, errors: ['DRAFT_LOCKED'], roles: EDITORS })
  async edit(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editSchema)) input: z.output<typeof editSchema>,
  ) {
    await this.write(req, res, 'draft.edit', async (tx) => {
      const d = await lockDraftRow(tx, id);
      await assertCanEdit(tx, this.clock, req.auth.userId, d);
      await tx
        .update(drafts)
        .set({
          payload: input.payload,
          updatedAt: this.clock.now(),
          ...(d.visibility === 'shared' ? { lockExpiresAt: new Date(this.clock.now().getTime() + LOCK_MS) } : {}),
        })
        .where(eq(drafts.id, id));
      return id;
    });
  }

  /** RF-ORD-07: privado → compartido (solo su autor). */
  @Post(':id/share')
  @Contract({ output: draftDtoSchema, roles: EDITORS })
  async share(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    await this.write(req, res, 'draft.share', async (tx) => {
      const d = await lockDraftRow(tx, id);
      if (d.ownerId !== req.auth.userId) throw new AppError('FORBIDDEN', 'Solo su autor puede compartir el borrador.');
      await tx
        .update(drafts)
        .set({ visibility: 'shared', sharedAt: this.clock.now(), updatedAt: this.clock.now() })
        .where(eq(drafts.id, id));
      return id;
    });
  }

  /** RF-ORD-09, plan §5.8: tomar el bloqueo de un borrador compartido. */
  @Post(':id/lock')
  @Contract({ output: draftDtoSchema, errors: ['DRAFT_LOCKED'], roles: EDITORS })
  async lock(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    await this.write(req, res, 'draft.lock', async (tx) => {
      assertShared(await lockDraftRow(tx, id), req.auth.userId);
      const now = this.clock.now();
      const [taken] = await tx
        .update(drafts)
        .set({ lockedBy: req.auth.userId, lockExpiresAt: new Date(now.getTime() + LOCK_MS) })
        .where(
          and(
            eq(drafts.id, id),
            or(isNull(drafts.lockedBy), eq(drafts.lockedBy, req.auth.userId), lt(drafts.lockExpiresAt, now)),
          ),
        )
        .returning({ id: drafts.id });
      if (!taken) throw await lockedError(tx, id);
      return id;
    });
  }

  /** Latido cada 60 s: el bloqueo dura 10 minutos más. */
  @Post(':id/heartbeat')
  @Contract({ output: draftDtoSchema, errors: ['DRAFT_LOCKED'], roles: EDITORS })
  async heartbeat(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    await this.write(
      req,
      res,
      'draft.heartbeat',
      async (tx) => {
        const d = await lockDraftRow(tx, id);
        assertShared(d, req.auth.userId);
        if (d.lockedBy !== req.auth.userId) throw await lockedError(tx, id);
        await tx
          .update(drafts)
          .set({ lockExpiresAt: new Date(this.clock.now().getTime() + LOCK_MS) })
          .where(eq(drafts.id, id));
        return id;
      },
      false,
    );
  }

  /** Soltar el bloqueo al salir; una Apoderada puede forzar el de otro (queda en la bitácora). */
  @Delete(':id/lock')
  @Contract({ output: draftDtoSchema, roles: EDITORS })
  async unlock(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    await this.write(req, res, 'draft.unlock', async (tx) => {
      const d = await lockDraftRow(tx, id);
      assertShared(d, req.auth.userId);
      if (d.lockedBy && d.lockedBy !== req.auth.userId && req.auth.role !== 'apoderada')
        throw new AppError('FORBIDDEN', 'Solo una Apoderada puede liberar el bloqueo de otro usuario.');
      await tx.update(drafts).set({ lockedBy: null, lockExpiresAt: null }).where(eq(drafts.id, id));
      return id;
    });
  }

  /** RF-ORD-11: descartar; queda en la bitácora. */
  @Delete(':id')
  @Contract({ output: draftDtoSchema, errors: ['DRAFT_LOCKED'], roles: EDITORS })
  async discard(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    await this.write(req, res, 'draft.discard', async (tx) => {
      const d = await lockDraftRow(tx, id);
      await assertCanEdit(tx, this.clock, req.auth.userId, d);
      await tx
        .update(drafts)
        .set({ discardedAt: this.clock.now(), lockedBy: null, lockExpiresAt: null, updatedAt: this.clock.now() })
        .where(eq(drafts.id, id));
      return id;
    });
  }

  // ---------- piezas comunes ----------

  private async write(
    req: AuthedRequest,
    res: Response,
    action: string,
    fn: (tx: Tx) => Promise<string>,
    replicate = true,
  ) {
    const result = await auditedWrite(
      this.db,
      this.clock,
      req,
      {
        userId: req.auth.userId,
        sessionId: req.auth.sessionId,
        deviceId: req.auth.deviceId,
        action,
        entityType: 'draft',
      },
      async (tx) => {
        const id = await fn(tx);
        const [body] = await readDrafts(tx, { ids: [id], includeClosed: true });
        if (replicate) await replicateOrders(tx, this.clock, { drafts: [id] });
        return { status: 200, body, entityId: id };
      },
    );
    res.status(result.status).json(result.body);
  }
}

const gone = () => new AppError('NOT_FOUND', 'El borrador no existe o ya se cerró.');

/** El borrador abierto (ni descartado ni emitido), bloqueado en la transacción. */
export async function lockDraftRow(tx: Tx, id: string) {
  const [d] = await tx.select().from(drafts).where(eq(drafts.id, id)).for('update');
  if (!d || d.discardedAt || d.issuedOrderId) throw gone();
  return d;
}

async function lockedError(tx: Tx, id: string) {
  const [row] = await tx
    .select({ name: users.fullName })
    .from(drafts)
    .innerJoin(users, eq(users.id, drafts.lockedBy))
    .where(eq(drafts.id, id));
  return new AppError('DRAFT_LOCKED', `En edición por ${row?.name ?? 'otro usuario'}.`, {
    lockedBy: row?.name ?? null,
  });
}

/** D9 · Privado: solo su autor (para los demás no existe). Compartido: quien tiene el bloqueo vigente. */
export async function assertCanEdit(tx: Tx, clock: Clock, userId: string, d: typeof drafts.$inferSelect) {
  if (d.visibility === 'private') {
    if (d.ownerId !== userId) throw gone();
    return;
  }
  const held = d.lockedBy && d.lockExpiresAt && d.lockExpiresAt > clock.now();
  if (held && d.lockedBy !== userId) throw await lockedError(tx, d.id);
  if (!held) throw new AppError('DRAFT_LOCKED', 'Abra el borrador para editarlo: hay que tomar su bloqueo.');
}

/** El bloqueo solo existe en los compartidos: un privado ajeno no existe y uno propio no se bloquea. */
function assertShared(d: typeof drafts.$inferSelect, userId: string) {
  if (d.visibility === 'shared') return;
  if (d.ownerId !== userId) throw gone();
  throw new AppError('VALIDATION_ERROR', 'Un borrador privado no se bloquea: solo lo edita su autor.');
}
