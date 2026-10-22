// T079 a T083 · RF-ORD-03 a 24, plan §5.1 a 5.4 y §6.2 (Órdenes). Emitir, corregir y anular son operaciones atómicas:
// validan con los datos bloqueados, numeran, descuentan el saldo y generan y archivan el PDF dentro de la misma
// transacción (DT-06); si algo falla, se revierte todo y el número no se consume. Son idempotentes (D15) y dejan su
// bitácora, también cuando una regla las rechaza (RF-ORD-14).
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  AppError,
  checkOrder,
  deadlineAt,
  formatOrderNumber,
  havanaDate,
  parseTons,
  tonsToApi,
  type Clock,
} from '@impocaribe/shared';
import {
  adv01,
  adv02,
  adv03,
  adv04,
  adv07,
  containerWarning,
  correctOrderSchema,
  issueOrderSchema,
  orderCheckResponseSchema,
  orderDtoSchema,
  pdfFileSchema,
  voidOrderSchema,
  type OrderSnapshot,
} from '@impocaribe/shared/validation';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { recordAudit, type Tx } from '../audit/audit-log.ts';
import { ALL_ROLES } from '../auth/auth.controller.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { drafts, loadOrders, loadOrderVersions, loadOrderVersionTrailers } from '../db/schema/orders.ts';
import { vessels } from '../db/schema/vessels.ts';
import { readStoredFile, storeFile } from '../files/files.ts';
import { auditedWrite } from '../http/audited-write.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DATA_DIR, DB } from '../tokens.ts';
import { assertVersion, EDITORS } from '../vessels/declarations.controller.ts';
import {
  buildSnapshot,
  capacityOf,
  declarationBalanceAfter,
  gather,
  problemsError,
  releaseIfExpired,
  sealImages,
  type OrderContext,
  type OrderFields,
} from './order-context.ts';
import { assertCanEdit, lockDraftRow } from './drafts.controller.ts';
import { PdfService } from './pdf-engine.ts';
import { orderDocumentHtml, type DocumentMark } from './pdf-template.ts';
import { readOrder, readOrders, replicateOrders } from './orders.repo.ts';

const ISSUE_ERRORS = [
  'MISSING_OFFICIAL_SIGNATURE',
  'DECLARATION_PENDING_TOTAL',
  'DECLARATION_EXPIRED',
  'DECLARATION_CLOSED',
  'VESSEL_CLOSED',
  'VESSEL_NOT_ARRIVED',
  'OVERDRAFT_ALLOCATION',
  'LOADING_DATE_BEFORE_ISSUE',
  'LOADING_DATE_TOO_FAR',
  'INACTIVE_RESOURCE',
  'DRIVER_CARRIER_MISMATCH',
  'TRAILER_CARRIER_MISMATCH',
  'CAPACITY_REQUIRES_OVERRIDE',
  'SAME_DAY_REQUIRES_OVERRIDE',
  'PDF_RENDER_FAILED',
] as const;
const DAY_MS = 86_400_000;

@Controller('orders')
export class OrdersController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DATA_DIR) private readonly dataDir: string,
    @Inject(PdfService) private readonly pdf: PdfService,
  ) {}

  @Get()
  @Contract({ output: z.array(orderDtoSchema), roles: ALL_ROLES })
  list() {
    return this.db.transaction((tx) => readOrders(tx));
  }

  @Get(':id')
  @Contract({ output: orderDtoSchema, roles: ALL_ROLES })
  one(@Param('id', ParseUUIDPipe) id: string) {
    return this.db.transaction((tx) => readOrder(tx, id));
  }

  /** RF-ORD-05: la simulación sin emitir: comprobaciones, advertencias, saldo y «quedaría». */
  @Post('check')
  @HttpCode(200)
  @Contract({ input: issueOrderSchema, output: orderCheckResponseSchema, roles: EDITORS })
  check(@Body(new ZodValidationPipe(issueOrderSchema)) input: z.output<typeof issueOrderSchema>) {
    return this.db.transaction(
      async (tx) => {
        const c = await gather(tx, this.clock, input, input, false);
        const tons = parseTons(input.tons);
        const after = c.balance.minus(tons);
        const dmAfter = declarationBalanceAfter(c, input.tons);
        const warnings = [
          ['declarationId', adv01(deadlineAt(c.declarationRow.deadlineStartDate, this.clock.now()).day)],
          ['tons', dmAfter ? adv02(dmAfter) : undefined],
          ['tons', adv03(tons, capacityOf(c))],
          ['loadingDate', adv04(input.loadingDate, c.today)],
          ['driverId', adv07(c.driverOrdersThatDay)],
          ['container', containerWarning(input.container ?? '')],
        ].flatMap(([field, message]) => (message ? [{ field: field!, message }] : []));
        return {
          problems: checkOrder(c.check(null)),
          warnings,
          allocationBalanceTons: tonsToApi(c.balance),
          afterTons: after.toFixed(3),
          capacityTons: tonsToApi(capacityOf(c)),
        };
      },
      { accessMode: 'read only' },
    );
  }

  /** RF-ORD-12 a 16: emitir (plan §5.1). */
  @Post()
  @HttpCode(201)
  @Contract({ input: issueOrderSchema, output: orderDtoSchema, errors: [...ISSUE_ERRORS], roles: EDITORS })
  async issue(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(issueOrderSchema)) input: z.output<typeof issueOrderSchema>,
  ) {
    await this.write(req, res, 'order.issue', null, 201, async (tx) => {
      const c = await gather(tx, this.clock, input, input, true);
      const problems = checkOrder(c.check(null));
      if (problems.length) throw problemsError(problems);
      // Const. art. VI: el contador vive en la fila del buque, bloqueada; UNIQUE(vessel_id, seq) es la segunda barrera.
      const seq = c.vessel.lastOrderSeq + 1;
      await tx.update(vessels).set({ lastOrderSeq: seq }).where(eq(vessels.id, c.vessel.id));
      const number = formatOrderNumber({
        code: c.vessel.code,
        year: parseInt(c.vessel.arrivalDate!.slice(0, 4), 10),
        voyage: c.vessel.voyageNo!,
        seq,
      });
      const [order] = await tx
        .insert(loadOrders)
        .values({
          vesselId: c.vessel.id,
          seq,
          number,
          declarationId: input.declarationId,
          allocationId: input.allocationId,
          status: 'official',
          createdAt: this.clock.now(),
        })
        .returning({ id: loadOrders.id });
      await this.addVersion(tx, req, c, input, order!.id, number, 1, 'official', null);
      // D9: solo se cierra el borrador que el usuario puede editar (el suyo privado, o el compartido que tiene abierto).
      if (input.draftId) await assertCanEdit(tx, this.clock, req.auth.userId, await lockDraftRow(tx, input.draftId));
      if (input.draftId)
        await tx
          .update(drafts)
          .set({ issuedOrderId: order!.id, lockedBy: null, lockExpiresAt: null, updatedAt: this.clock.now() })
          .where(eq(drafts.id, input.draftId));
      return {
        id: order!.id,
        after: { number, tons: input.tons, overrides: input.overrides ?? null },
        touched: {
          orders: [order!.id],
          vessels: [c.vessel.id],
          declarations: [input.declarationId],
          drafts: input.draftId ? [input.draftId] : [],
        },
      };
    });
  }

  /** RF-ORD-17, 18: corregir (plan §5.3). La DM y el buque no cambian. */
  @Post(':id/corrections')
  @HttpCode(201)
  @Contract({
    input: correctOrderSchema,
    output: orderDtoSchema,
    errors: [...ISSUE_ERRORS, 'STALE_RECORD', 'ORDER_VOIDED', 'EXPIRED_CANNOT_INCREASE'],
    roles: EDITORS,
  })
  async correct(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(correctOrderSchema)) input: z.output<typeof correctOrderSchema>,
  ) {
    await this.write(req, res, 'order.correct', id, 201, async (tx) => {
      const { order, current, first } = await this.current(tx, id);
      const c = await gather(tx, this.clock, { ...order, orderId: id }, input, true);
      await this.assertOpen(tx, id, input.expectedVersion);
      const problems = checkOrder(c.check({ currentTons: parseTons(current.tons), firstIssueDate: first }));
      if (problems.length) throw problemsError(problems);
      await this.replace(tx, current.id);
      await this.addVersion(tx, req, c, input, id, order.number, current.versionNo + 1, 'official', input.reason);
      if (parseTons(input.tons).lessThan(parseTons(current.tons)))
        await releaseIfExpired(tx, this.clock, c, input.reason, req.auth.userId);
      return {
        id,
        before: { versionNo: current.versionNo, tons: current.tons },
        after: { versionNo: current.versionNo + 1, tons: input.tons, reason: input.reason },
        touched: { orders: [id], vessels: [order.vesselId], declarations: [order.declarationId] },
      };
    });
  }

  /** RF-ORD-19: anular (plan §5.4). Repone todo el saldo; el PDF lleva la marca ANULADA y la firma y el cuño de la versión. */
  @Post(':id/void')
  @HttpCode(201)
  @Contract({
    input: voidOrderSchema,
    output: orderDtoSchema,
    errors: ['STALE_RECORD', 'ORDER_VOIDED'],
    roles: EDITORS,
  })
  async void(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(voidOrderSchema)) input: z.output<typeof voidOrderSchema>,
  ) {
    await this.write(req, res, 'order.void', id, 201, async (tx) => {
      const { order, current, trailerIds } = await this.current(tx, id);
      const c = await gather(
        tx,
        this.clock,
        { ...order, orderId: id },
        {
          ...current,
          trailerIds,
          lotNo: current.lotNo,
          routeSheetNo: current.routeSheetNo,
          container: current.container,
        },
        true,
      );
      await this.assertOpen(tx, id, input.expectedVersion);
      const snapshot: OrderSnapshot = {
        ...(current.snapshot as OrderSnapshot),
        versionNo: current.versionNo + 1,
        issueDate: c.today,
      };
      const images = await sealImages(tx, this.dataDir, current.signatureId, current.stampId);
      const pdf = await this.render(snapshot, images, ['ANULADA']);
      const fileId = await storeFile(tx, this.clock, this.dataDir, pdf, 'application/pdf');
      await this.replace(tx, current.id);
      const [v] = await tx
        .insert(loadOrderVersions)
        .values({
          ...current,
          id: undefined,
          versionNo: current.versionNo + 1,
          status: 'voided',
          issuedAt: this.clock.now(),
          issuedBy: req.auth.userId,
          issuedDevice: req.auth.deviceId,
          reason: input.reason,
          snapshot,
          pdfFileId: fileId,
          pdfSha256: sha256(pdf),
        })
        .returning({ id: loadOrderVersions.id });
      await this.copyTrailers(tx, current.id, v!.id);
      await tx.update(loadOrders).set({ status: 'voided', currentVersionId: v!.id }).where(eq(loadOrders.id, id));
      await releaseIfExpired(tx, this.clock, c, input.reason, req.auth.userId);
      return {
        id,
        before: { versionNo: current.versionNo, tons: current.tons },
        after: { versionNo: current.versionNo + 1, status: 'voided', reason: input.reason },
        touched: { orders: [id], vessels: [order.vesselId], declarations: [order.declarationId] },
      };
    });
  }

  /**
   * RF-ORD-21: quien emitió la versión descarga el original sin marca durante 24 horas; cualquier otra descarga sale
   * marcada COPIA. Toda descarga queda en la bitácora. El PDF viaja en base64 dentro del JSON (como las imágenes de F3).
   */
  @Get(':id/versions/:n/pdf')
  @Contract({ output: pdfFileSchema, roles: ALL_ROLES })
  download(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('n', ParseIntPipe) n: number,
  ): Promise<z.infer<typeof pdfFileSchema>> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ v: loadOrderVersions, number: loadOrders.number })
        .from(loadOrderVersions)
        .innerJoin(loadOrders, eq(loadOrders.id, loadOrderVersions.orderId))
        .where(and(eq(loadOrderVersions.orderId, id), eq(loadOrderVersions.versionNo, n)));
      if (!row) throw new AppError('NOT_FOUND', 'Esa versión de la orden no existe.');
      const { v } = row;
      const original = v.issuedBy === req.auth.userId && this.clock.now().getTime() - v.issuedAt.getTime() < DAY_MS;
      let bytes: Uint8Array;
      if (original) bytes = (await readStoredFile(tx, this.dataDir, v.pdfFileId)).bytes;
      else {
        const images = await sealImages(tx, this.dataDir, v.signatureId, v.stampId);
        const marks: DocumentMark[] = v.status === 'voided' ? ['ANULADA', 'COPIA'] : ['COPIA'];
        bytes = await this.render(v.snapshot as OrderSnapshot, images, marks);
      }
      const kind = original ? 'original' : 'copy';
      await recordAudit(tx, this.clock, {
        userId: req.auth.userId,
        sessionId: req.auth.sessionId,
        deviceId: req.auth.deviceId,
        action: 'order.download',
        entityType: 'order',
        entityId: id,
        after: { versionNo: n, kind },
      });
      return {
        kind,
        fileName: `${row.number}${n > 1 ? `-v${n}` : ''}${original ? '' : '-copia'}.pdf`,
        mime: 'application/pdf' as const,
        base64: Buffer.from(bytes).toString('base64'),
      };
    });
  }

  // ---------- piezas comunes ----------

  private async write(
    req: AuthedRequest,
    res: Response,
    action: string,
    entityId: string | null,
    status: number,
    fn: (tx: Tx) => Promise<{
      id: string;
      before?: unknown;
      after: unknown;
      touched: { orders?: string[]; vessels?: string[]; declarations?: string[]; drafts?: string[] };
    }>,
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
        entityType: 'order',
        ...(entityId ? { entityId } : {}),
      },
      async (tx) => {
        const done = await fn(tx);
        const body = await readOrder(tx, done.id);
        await replicateOrders(tx, this.clock, done.touched);
        // shortcut: las alertas AL-05 (sobregiro), AL-06 y AL-07 (excepciones) y AL-17 llegan con el motor de alertas (F7).
        return { status, body, entityId: done.id, before: done.before, after: done.after };
      },
    );
    res.status(result.status).json(result.body);
  }

  /** La orden con su versión vigente y la fecha de emisión de la versión 1 (sin bloquear: gather bloquea en orden). */
  private async current(tx: Tx, id: string) {
    const [order] = await tx.select().from(loadOrders).where(eq(loadOrders.id, id));
    if (!order) throw new AppError('NOT_FOUND', 'La orden no existe.');
    const [current] = await tx
      .select()
      .from(loadOrderVersions)
      .where(eq(loadOrderVersions.id, order.currentVersionId!));
    const [first] = await tx
      .select({ issuedAt: loadOrderVersions.issuedAt })
      .from(loadOrderVersions)
      .where(and(eq(loadOrderVersions.orderId, id), eq(loadOrderVersions.versionNo, 1)));
    const trailerRows = await tx
      .select({ trailerId: loadOrderVersionTrailers.trailerId, position: loadOrderVersionTrailers.position })
      .from(loadOrderVersionTrailers)
      .where(eq(loadOrderVersionTrailers.versionId, current!.id));
    return {
      order,
      current: current!,
      first: havanaDate(first!.issuedAt),
      trailerIds: trailerRows.sort((a, b) => a.position - b.position).map((r) => r.trailerId),
    };
  }

  /** Ya bloqueada: no anulada y en la versión que vio el usuario (DT-23). */
  private async assertOpen(tx: Tx, id: string, expectedVersion: number) {
    const [order] = await tx.select().from(loadOrders).where(eq(loadOrders.id, id));
    if (order!.status === 'voided')
      throw new AppError('ORDER_VOIDED', `La orden ${order!.number} está anulada: no admite más versiones.`);
    const [current] = await tx
      .select({ versionNo: loadOrderVersions.versionNo })
      .from(loadOrderVersions)
      .where(eq(loadOrderVersions.id, order!.currentVersionId!));
    assertVersion({ rowVersion: current!.versionNo }, expectedVersion);
  }

  private replace(tx: Tx, versionId: string) {
    return tx.update(loadOrderVersions).set({ status: 'replaced' }).where(eq(loadOrderVersions.id, versionId));
  }

  /** Inserta una versión oficial con su documento y su PDF, y la deja vigente. */
  private async addVersion(
    tx: Tx,
    req: AuthedRequest,
    c: OrderContext,
    f: OrderFields,
    orderId: string,
    number: string,
    versionNo: number,
    status: 'official',
    reason: string | null,
  ) {
    const signature = c.signature!;
    const stamp = c.stamp!;
    const snapshot = buildSnapshot(c, f, number, versionNo, signature);
    const pdf = await this.render(snapshot, await sealImages(tx, this.dataDir, signature.id, stamp.id), []);
    const fileId = await storeFile(tx, this.clock, this.dataDir, pdf, 'application/pdf');
    const [v] = await tx
      .insert(loadOrderVersions)
      .values({
        orderId,
        versionNo,
        status,
        declarationVersionId: c.declarationRow.currentVersionId!,
        recipientId: f.recipientId,
        truckId: f.truckId,
        driverId: f.driverId,
        tons: f.tons,
        waybillNo: f.waybillNo,
        lotNo: f.lotNo ?? null,
        routeSheetNo: f.routeSheetNo ?? null,
        container: f.container ?? null,
        loadingDate: f.loadingDate,
        issuedAt: this.clock.now(),
        issuedBy: req.auth.userId,
        issuedDevice: req.auth.deviceId,
        reason,
        capacityOverrideReason: f.overrides?.capacity ?? null,
        sameDayOverrideReason: f.overrides?.sameDay ?? null,
        signatureId: signature.id,
        stampId: stamp.id,
        snapshot,
        pdfFileId: fileId,
        pdfSha256: sha256(pdf),
      })
      .returning({ id: loadOrderVersions.id });
    await tx.insert(loadOrderVersionTrailers).values(
      c.trailers.map((r, i) => ({
        versionId: v!.id,
        trailerId: r.id,
        position: i,
        capacityTonsSnapshot: r.capacityTons,
      })),
    );
    await tx.update(loadOrders).set({ currentVersionId: v!.id }).where(eq(loadOrders.id, orderId));
  }

  private async copyTrailers(tx: Tx, from: string, to: string) {
    const rows = await tx.select().from(loadOrderVersionTrailers).where(eq(loadOrderVersionTrailers.versionId, from));
    await tx.insert(loadOrderVersionTrailers).values(rows.map((r) => ({ ...r, versionId: to })));
  }

  /** DT-06: si el PDF falla, la transacción entera se revierte y el número no se consume. */
  private async render(snapshot: OrderSnapshot, images: Awaited<ReturnType<typeof sealImages>>, marks: DocumentMark[]) {
    try {
      return await this.pdf.render(orderDocumentHtml(snapshot, images, marks));
    } catch (err) {
      throw new AppError('PDF_RENDER_FAILED', 'No se pudo generar el PDF de la orden. Inténtelo de nuevo.', {
        cause: String(err),
      });
    }
  }
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
