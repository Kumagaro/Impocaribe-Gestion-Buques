// T094 · spec §5.13, plan §5.7 y DT-08: las alertas de condición. Cada pasada calcula qué condiciones se cumplen ahora,
// abre las que faltan y resuelve las que ya no se cumplen, todo en una transacción. La corre AlertsService al arrancar,
// cada 10 minutos y poco después de cada cambio sincronizado.
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import {
  compareTons,
  CONFIRM_EVERY_DAYS,
  confirmationOverdue,
  deadlineAt,
  formatTons,
  parseTons,
  powerMode,
  type AlertType,
  type Clock,
  type PowerReading,
} from '@impocaribe/shared';
import { and, asc, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Tx } from '../audit/audit-log.ts';
import { officialSignatures, officialStamps, systemSettings } from '../db/schema/company.ts';
import { passwordState } from '../backups/backup-password.controller.ts';
import { backupHealthRows } from '../backups/backup.ts';
import { backupProblems } from '../backups/schedule.ts';
import { devices } from '../db/schema/devices.ts';
import { drafts, loadOrders } from '../db/schema/orders.ts';
import { lostOrders } from '../db/schema/restores.ts';
import {
  allocations,
  customsDeclarations,
  vAllocationBalance,
  vDeclarationBalance,
  vessels,
  vVesselBalance,
} from '../db/schema/vessels.ts';
import { Maintenance } from '../backups/maintenance.ts';
import { Power } from '../power/power.ts';
import { Realtime } from '../sync/realtime.ts';
import { ALERT_CONDITIONS_ENABLED, CLOCK, DB } from '../tokens.ts';
import { openCondition, replicateAlerts, resolveMissing, type AlertInput } from './alerts.ts';

/** Las que evalúa esta pasada. */
export const EVALUATED: AlertType[] = [
  'AL-01',
  'AL-03',
  'AL-08',
  'AL-09',
  'AL-12',
  'AL-16',
  'AL-17',
  'AL-18',
  'AL-19',
  'AL-20',
  'AL-21',
  'AL-23',
];

const DAY_MS = 86_400_000;
/** AL-09: días sin órdenes. */
export const IDLE_DAYS = 5;
/** AL-08: horas desde la última edición de un borrador compartido. */
export const DRAFT_HOURS = 24;
/** AL-18 y RF-CON-10: desfase máximo de la hora de un dispositivo. */
export const MAX_SKEW_MS = 5 * 60_000;

type Wanted = [key: string, alert: AlertInput];

/** Las DM ni cerradas ni vencidas (tampoco la que venció por la hora y aún no se marcó), con lo que piden sus alertas. */
export async function openDeclarations(tx: Tx, now: Date) {
  const rows = await tx
    .select({
      id: customsDeclarations.id,
      number: customsDeclarations.number,
      start: customsDeclarations.deadlineStartDate,
      total: vDeclarationBalance.totalTons,
      loaded: vDeclarationBalance.loadedTons,
      pending: vDeclarationBalance.pendingAllocationTons,
      withBalance: sql<boolean>`EXISTS (SELECT 1 FROM ${vAllocationBalance} WHERE ${vAllocationBalance.declarationId} = ${customsDeclarations.id} AND ${vAllocationBalance.balanceTons} > 0)`,
      lastOrderAt:
        sql`(SELECT max(${loadOrders.createdAt}) FROM ${loadOrders} WHERE ${loadOrders.declarationId} = ${customsDeclarations.id})`.mapWith(
          loadOrders.createdAt,
        ),
      firstAllocationAt:
        sql`(SELECT min(${allocations.createdAt}) FROM ${allocations} WHERE ${allocations.declarationId} = ${customsDeclarations.id})`.mapWith(
          allocations.createdAt,
        ),
    })
    .from(customsDeclarations)
    .innerJoin(vDeclarationBalance, eq(vDeclarationBalance.declarationId, customsDeclarations.id))
    .where(isNull(customsDeclarations.expiredAt))
    .orderBy(asc(customsDeclarations.number));
  return rows.flatMap((d) => {
    const deadline = deadlineAt(d.start, now);
    const closed = d.total !== null && compareTons(parseTons(d.loaded), parseTons(d.total)) === 0;
    if (closed || deadline.expired) return [];
    // RF-DM-10: sin total o con toneladas sin asignar a ningún buque.
    const pending = d.total === null || compareTons(parseTons(d.pending!), parseTons('0')) > 0;
    return [{ ...d, deadline, pending }];
  });
}

async function declarationConditions(tx: Tx, now: Date): Promise<Wanted[]> {
  const out: Wanted[] = [];
  for (const d of await openDeclarations(tx, now)) {
    const { deadline } = d;
    const entity = { type: 'declaration', id: d.id };
    if (d.pending)
      out.push([
        `AL-01:${d.id}`,
        {
          type: 'AL-01',
          title: `DM ${d.number} pendiente`,
          detail:
            d.total === null
              ? 'No tiene total: regístrelo para poder asignarla.'
              : 'Tiene toneladas sin asignar a ningún buque.',
          entity,
        },
      ]);
    if (deadline.warning)
      out.push([
        `AL-03:${d.id}`,
        {
          type: 'AL-03',
          title: `DM ${d.number} en el día ${deadline.day} del plazo`,
          detail: 'Al empezar el día 31 vence y lo no cargado vuelve libre a su buque.',
          entity,
        },
      ]);
    const since = d.lastOrderAt ?? d.firstAllocationAt;
    if (d.total !== null && d.withBalance && since && now.getTime() - since.getTime() >= IDLE_DAYS * DAY_MS)
      out.push([
        `AL-09:${d.id}`,
        {
          type: 'AL-09',
          title: `DM ${d.number} sin movimiento`,
          detail: d.lastOrderAt
            ? `Lleva ${IDLE_DAYS} días o más sin órdenes desde la última.`
            : `Lleva ${IDLE_DAYS} días o más sin órdenes desde su primera asignación.`,
          entity,
        },
      ]);
  }
  return out;
}

/** Lo que no está en la base: la energía de la PC servidor (T132) y los dispositivos conectados ahora (T134). */
export interface LiveState {
  power?: PowerReading;
  connectedDevices?: number;
}

/** T134 · RF-RED-01: con hotspot, a partir de tantos dispositivos conectados se avisa (AL-21). */
export const HOTSPOT_LIMIT = 8;

async function otherConditions(tx: Tx, now: Date, live: LiveState): Promise<Wanted[]> {
  const out: Wanted[] = [];
  const stale = await tx
    .select({ id: drafts.id, ownerId: drafts.ownerId })
    .from(drafts)
    .where(
      and(
        eq(drafts.visibility, 'shared'),
        isNull(drafts.discardedAt),
        isNull(drafts.issuedOrderId),
        lte(drafts.updatedAt, new Date(now.getTime() - DRAFT_HOURS * 3_600_000)),
      ),
    );
  for (const d of stale)
    out.push([
      `AL-08:${d.id}`,
      {
        type: 'AL-08',
        title: 'Borrador compartido sin emitir',
        detail: `Nadie lo edita desde hace más de ${DRAFT_HOURS} h. Emítalo o descártelo.`,
        entity: { type: 'draft', id: d.id },
        targetUserId: d.ownerId,
      },
    ]);

  const [signature] = await tx.select({ id: officialSignatures.id }).from(officialSignatures).limit(1);
  const [stamp] = await tx.select({ id: officialStamps.id }).from(officialStamps).limit(1);
  if (!signature || !stamp)
    out.push([
      'AL-16',
      {
        type: 'AL-16',
        title:
          !signature && !stamp
            ? 'Faltan la firma y el cuño oficiales'
            : signature
              ? 'Falta el cuño oficial'
              : 'Falta la firma oficial',
        detail: 'Sin ellos no se pueden emitir ni corregir órdenes. Una Apoderada los carga en Empresa.',
      },
    ]);

  const surplus = await tx
    .select({ id: vessels.id, name: vessels.name, tons: vVesselBalance.unresolvedSurplusTons })
    .from(vessels)
    .innerJoin(vVesselBalance, eq(vVesselBalance.vesselId, vessels.id))
    .where(and(eq(vessels.status, 'closed'), sql`${vVesselBalance.unresolvedSurplusTons} > 0`));
  for (const v of surplus)
    out.push([
      `AL-17:${v.id}`,
      {
        type: 'AL-17',
        title: `Buque ${v.name} con sobrante sin destino`,
        detail: `Quedan ${formatTons(parseTons(v.tons))} sin destino: asígnelas, trasládelas o regístrelas como pérdida.`,
        entity: { type: 'vessel', id: v.id },
      },
    ]);

  const skewed = await tx
    .select({ id: devices.id, name: devices.name, offset: devices.clockOffsetMs })
    .from(devices)
    .where(
      and(
        isNull(devices.revokedAt),
        isNotNull(devices.lastSeenAt),
        sql`abs(${devices.clockOffsetMs}) > ${MAX_SKEW_MS}`,
      ),
    );
  for (const d of skewed)
    out.push([
      `AL-18:${d.id}`,
      {
        type: 'AL-18',
        title: `La hora de ${d.name} está desfasada`,
        detail: `Difiere ${Math.round(Math.abs(d.offset) / 60_000)} min de la del servidor. Corríjala en el dispositivo.`,
        entity: { type: 'device', id: d.id },
      },
    ]);

  // AL-12 · RF-RES-01, 05: sin contraseña de respaldo, el último falló, atrasado en la jornada o sin copia externa.
  const [settings] = await tx.select().from(systemSettings);
  if (settings) {
    const rows = await backupHealthRows(tx);
    const problems = backupProblems(
      {
        passwordDefined: settings.backupPublicKey !== null,
        lastStatus: rows.last?.status ?? null,
        lastError: rows.last?.error ?? null,
        lastOk: rows.lastOk,
        externalDir: settings.externalBackupDir,
        lastExternalCopy: rows.lastExternal,
        since: settings.backupPasswordSetAt,
        workdayStart: settings.workdayStart,
        workdayEnd: settings.workdayEnd,
      },
      now,
    );
    for (const [key, title, detail] of problems) out.push([key, { type: 'AL-12', title, detail }]);
  }

  // AL-19 · RF-RES-07: órdenes perdidas en una restauración que nadie recuperó ni descartó.
  const [lost] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(lostOrders)
    .where(eq(lostOrders.status, 'pending'));
  if (lost && lost.n > 0)
    out.push([
      'AL-19',
      {
        type: 'AL-19',
        title: 'Órdenes perdidas por recuperar',
        detail:
          'La restauración dejó órdenes emitidas después del respaldo: recupérelas o descártelas con motivo en Respaldos.',
      },
    ]);

  // AL-23 · RF-RES-08: 90 días sin confirmar la contraseña de respaldo (aunque se haya aplazado al iniciar sesión).
  if (settings && confirmationOverdue(passwordState(settings), now))
    out.push([
      'AL-23',
      {
        type: 'AL-23',
        title: 'Contraseña de respaldo sin confirmar',
        detail: `Lleva más de ${CONFIRM_EVERY_DAYS} días sin que una Apoderada la escriba. Si nadie la recuerda, los respaldos no se podrán restaurar.`,
      },
    ]);

  // AL-20 · RF-ENE-02, 03: el servidor con batería o en modo protegido; se resuelve sola al volver la corriente. El
  // porcentaje en vivo va en la banda de las apps (server.power): el título no cambia mientras la alerta sigue abierta.
  const mode = powerMode(live.power ?? { onBattery: false, percent: null });
  if (mode === 'battery')
    out.push([
      'AL-20',
      {
        type: 'AL-20',
        title: 'El servidor funciona con batería',
        detail: 'Sin corriente en la PC servidor. Al 15 % pasa a modo protegido (solo consulta) y al 5 % se detiene.',
      },
    ]);
  else if (mode !== 'mains')
    out.push([
      'AL-20:protegido',
      {
        type: 'AL-20',
        title: 'Servidor en modo protegido por batería baja',
        detail: 'No se aceptan cambios hasta que vuelva la corriente; los datos están asegurados. Al 5 % se detiene.',
      },
    ]);

  // AL-21 · RF-RED-01: con el hotspot de un celular, 8 o más dispositivos conectados; con router, nunca.
  if (settings?.networkSetup === 'hotspot' && (live.connectedDevices ?? 0) >= HOTSPOT_LIMIT)
    out.push([
      'AL-21',
      {
        type: 'AL-21',
        title: 'Cerca del límite del hotspot',
        detail: `Hay ${HOTSPOT_LIMIT} o más dispositivos conectados al hotspot del celular. Con más, la conexión se vuelve lenta e inestable: para más dispositivos hace falta un router wifi.`,
      },
    ]);
  return out;
}

/** Una pasada completa. Devuelve cuántas alertas abrió y cuántas resolvió. Sin `live`: con corriente y nadie conectado. */
export async function evaluateConditions(db: NodePgDatabase, clock: Clock, live: LiveState = {}) {
  return db.transaction(async (tx) => {
    // Una sola pasada a la vez (varias pueden coincidir: el temporizador y un cambio).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('impocaribe_alert_conditions'))`);
    const now = clock.now();
    const wanted = [...(await declarationConditions(tx, now)), ...(await otherConditions(tx, now, live))];
    const opened: string[] = [];
    for (const [key, alert] of wanted) {
      const id = await openCondition(tx, clock, key, alert);
      if (id) opened.push(id);
    }
    const resolved = await resolveMissing(
      tx,
      clock,
      EVALUATED,
      wanted.map(([key]) => key),
    );
    await replicateAlerts(tx, clock, [...opened, ...resolved]);
    return { opened: opened.length, resolved: resolved.length };
  });
}

const EVERY_MS = 10 * 60_000;
/** Tras un cambio sincronizado; varios seguidos dan una sola pasada. */
export const SETTLE_MS = 1_500;

@Injectable()
export class AlertConditions implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('AlertConditions');
  private timer: NodeJS.Timeout | undefined;
  private soonTimer: NodeJS.Timeout | undefined;
  private stopListening: (() => void) | undefined;

  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ALERT_CONDITIONS_ENABLED) private readonly enabled: boolean,
    private readonly realtime: Realtime,
    private readonly maintenance: Maintenance,
    private readonly power: Power,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    this.run();
    this.timer = setInterval(() => this.run(), EVERY_MS);
    this.timer.unref();
    const stopSync = this.realtime.onSync(() => this.soon());
    // T132: AL-20 se abre o se resuelve en cuanto cambia la energía.
    const stopPower = this.power.onChange(() => this.soon());
    // T134: AL-21 se abre o se resuelve cuando un dispositivo se conecta o se desconecta.
    const stopConnections = this.realtime.onConnections(() => this.soon());
    this.stopListening = () => {
      stopSync();
      stopPower();
      stopConnections();
    };
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
    clearTimeout(this.soonTimer);
    this.stopListening?.();
  }

  /** Una pasada en breve (AL-18 al medir la hora de un dispositivo, o tras un cambio). */
  soon(): void {
    if (!this.enabled) return;
    clearTimeout(this.soonTimer);
    this.soonTimer = setTimeout(() => this.run(), SETTLE_MS);
    this.soonTimer.unref();
  }

  private run(): void {
    if (this.maintenance.active) return;
    void evaluateConditions(this.db, this.clock, {
      power: this.power.state,
      connectedDevices: this.realtime.connectedDevices(),
    }).catch((err: unknown) => this.log.error(`No se pudieron evaluar las alertas: ${String(err)}`));
  }
}
