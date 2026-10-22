// T092 · RF-ALR-03 a 05, plan §6.2 (Alertas): el centro de alertas. Cada usuario ve las de sus roles (y AL-08 su autor);
// las de evento las atiende quien dice la tabla AL, con su nombre y la hora en la bitácora; las de condición se
// resuelven solas.
import { Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { AppError, ALERTS, attendsAlert, type AlertType, type Clock } from '@impocaribe/shared';
import { alertDtoSchema, alertsQuerySchema } from '@impocaribe/shared/validation';
import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'express';
import { z } from 'zod';
import { ALL_ROLES } from '../auth/auth.controller.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { alerts } from '../db/schema/alerts.ts';
import { auditedWrite } from '../http/audited-write.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DB } from '../tokens.ts';
import { readAlerts, replicateAlerts } from './alerts.ts';

/** RF-ALR-05: las que ve esta sesión. */
const visibleTo = (req: AuthedRequest): SQL =>
  or(sql`${req.auth.role} = ANY(${alerts.audienceRoles})`, eq(alerts.targetUserId, req.auth.userId))!;

const notFound = () => new AppError('NOT_FOUND', 'La alerta no existe.');

@Controller('alerts')
export class AlertsController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  @Contract({ output: z.array(alertDtoSchema), roles: ALL_ROLES })
  list(
    @Req() req: AuthedRequest,
    @Query(new ZodValidationPipe(alertsQuerySchema)) q: z.output<typeof alertsQuerySchema>,
  ) {
    return this.db.transaction((tx) =>
      readAlerts(tx, {
        where: and(
          visibleTo(req),
          q.status ? eq(alerts.status, q.status) : undefined,
          q.type ? eq(alerts.type, q.type) : undefined,
        )!,
      }),
    );
  }

  /** RF-ALR-03: atender una de evento. Repetirlo no cambia quién la atendió. */
  @Post(':id/attend')
  @HttpCode(200)
  @Contract({ output: alertDtoSchema, roles: ALL_ROLES })
  async attend(@Req() req: AuthedRequest, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string) {
    const result = await auditedWrite(
      this.db,
      this.clock,
      req,
      {
        userId: req.auth.userId,
        sessionId: req.auth.sessionId,
        deviceId: req.auth.deviceId,
        action: 'alert.attend',
        entityType: 'alert',
      },
      async (tx) => {
        const [row] = await tx
          .select()
          .from(alerts)
          .where(and(eq(alerts.id, id), visibleTo(req)))
          .for('update');
        if (!row) throw notFound();
        if (ALERTS[row.type as AlertType].kind !== 'event')
          throw new AppError('FORBIDDEN', 'Esta alerta se resuelve sola cuando desaparece su causa.');
        if (!attendsAlert(row.type as AlertType, req.auth.role))
          throw new AppError('FORBIDDEN', 'Su rol puede ver esta alerta, pero no atenderla.');
        if (row.status === 'open') {
          await tx
            .update(alerts)
            .set({ status: 'attended', attendedBy: req.auth.userId, attendedAt: this.clock.now() })
            .where(eq(alerts.id, id));
          await replicateAlerts(tx, this.clock, [id]);
        }
        const [body] = await readAlerts(tx, { ids: [id] });
        return { status: 200, body, entityId: id, before: { status: row.status }, after: { status: body!.status } };
      },
    );
    res.status(result.status).json(result.body);
  }
}
