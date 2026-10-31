// T086 y T089 · P-13 Nueva orden y P-16 Corregir (plan §7.3). RF-ORD-03 a 05, 12, 13, 17, 18, RF-VAL-08, F-14. Todo se
// elige de la copia local: la DM y su buque, el destinatario de su cliente y, desde el transportista, sus camiones,
// choferes y remolques (se proponen los habituales del camión). El panel de saldo se calcula con las mismas reglas del
// servidor (`checkOrder`), que vuelve a decidir con los datos reales al emitir.
import {
  addTons,
  checkOrder,
  deadlineAt,
  formatTons,
  havanaDate,
  parseTons,
  subTons,
  TonsParseError,
  type OrderProblem,
  type Tons,
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
  reasonSchema,
  type CarrierDto,
  type ClientDto,
  type DeclarationDto,
  type DraftPayload,
  type DriverDto,
  type OrderDto,
  type TrailerDto,
  type TruckDto,
  type VesselDto,
} from '@impocaribe/shared/validation';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ApiError } from '../../api/client';
import { ordersApi } from '../../api/endpoints/orders';
import { useAppSession } from '../../session/SessionProvider';
import { useServerNow } from '../../sync/SyncProvider';
import { useValidatedForm } from '../../validation/useValidatedForm';
import { byText, useCatalog, useLocal } from '../catalogs/useCatalog';
import { statusOf, tonsText } from '../declarations/useDeclarations';

// shortcut: el máximo de días de la fecha de carga es el de por defecto (RF-CFG-02) hasta que la configuración se
// replique a todos (F7); el servidor decide con el valor real al emitir.
const MAX_LOADING_DAYS = 7;

const tonsOrNull = (s: string): Tons | null => {
  try {
    return s.trim() === '' ? null : parseTons(s);
  } catch (err) {
    if (err instanceof TonsParseError) return null;
    throw err;
  }
};

const LABELS = {
  declarationId: 'DM',
  allocationId: 'Buque',
  recipientId: 'Destinatario',
  carrierId: 'Transportista',
  truckId: 'Camión',
  trailerIds: 'Remolques',
  driverId: 'Chofer',
  tons: 'Toneladas',
  waybillNo: 'Carta de porte',
  loadingDate: 'Fecha de carga',
  lotNo: 'LOT',
  routeSheetNo: 'Hoja de ruta',
  container: 'Contenedor',
  reason: 'Motivo',
};
const carrierField = z.uuid({ error: 'Elija el transportista.' });
/** Nueva orden: los campos de F-14, más el transportista (que solo filtra) y sin motivo. */
const newSchema = issueOrderSchema
  .omit({ draftId: true, overrides: true })
  .extend({ carrierId: carrierField, reason: z.string() });
/** Corregir: además, el motivo obligatorio (la DM y el buque van fijos). */
const correctSchema = newSchema.extend({ reason: reasonSchema });
type Values = z.input<typeof newSchema>;

export type CheckItem = { tone: 'ok' | 'warn' | 'bad'; text: string };
export type Override = { kind: 'capacity' | 'sameDay'; title: string; rule: string };

export interface OrderFormOptions {
  /** P-16: la orden que se corrige. */
  correcting?: OrderDto;
  /** Al abrir un borrador. */
  initial?: DraftPayload;
  /** Cada cambio (para el autoguardado del borrador). */
  onChange?: (payload: DraftPayload) => void;
  /** Tras emitir o corregir. */
  onDone: (order: OrderDto) => void | Promise<void>;
  draftId?: string;
}

/** Lo que se lleva escrito, como borrador (RF-ORD-06). */
export function payloadOf(v: Values): DraftPayload {
  const s = (x: unknown) => (typeof x === 'string' ? x : '');
  return {
    declarationId: s(v.declarationId),
    allocationId: s(v.allocationId),
    recipientId: s(v.recipientId),
    carrierId: s(v.carrierId),
    truckId: s(v.truckId),
    trailerIds: Array.isArray(v.trailerIds) ? v.trailerIds.map(String) : [],
    driverId: s(v.driverId),
    tons: s(v.tons),
    waybillNo: s(v.waybillNo),
    loadingDate: s(v.loadingDate),
    lotNo: s(v.lotNo),
    routeSheetNo: s(v.routeSheetNo),
    container: s(v.container),
  };
}

export function useOrderForm(o: OrderFormOptions) {
  const base = useCatalog();
  const { session } = useAppSession();
  const now = useServerNow()();
  const today = havanaDate(now);
  const declarations = useLocal<DeclarationDto>(
    'declaration',
    byText((d) => d.number),
  );
  const vessels = useLocal<VesselDto>(
    'vessel',
    byText((v) => v.name),
  );
  const clients = useLocal<ClientDto>(
    'client',
    byText((c) => c.name),
  );
  const carriers = useLocal<CarrierDto>(
    'carrier',
    byText((c) => c.name),
  );
  const trucks = useLocal<TruckDto>(
    'truck',
    byText((t) => t.plate),
  );
  const trailers = useLocal<TrailerDto>(
    'trailer',
    byText((t) => t.plate),
  );
  const drivers = useLocal<DriverDto>(
    'driver',
    byText((d) => d.fullName),
  );
  const orders = useLocal<OrderDto>(
    'order',
    byText((x) => x.number),
  );
  const fixing = o.correcting ?? null;
  const [override, setOverride] = useState<Override | null>(null);
  const overrides = useRef<{ capacity?: string; sameDay?: string }>({});
  const [issued, setIssued] = useState<OrderDto | null>(null);

  const start: Values = fixing
    ? {
        declarationId: fixing.declarationId,
        allocationId: fixing.allocationId,
        recipientId: fixing.current.recipientId,
        carrierId: trucks.find((t) => t.id === fixing.current.truckId)?.carrierId ?? '',
        truckId: fixing.current.truckId,
        trailerIds: fixing.current.trailerIds,
        driverId: fixing.current.driverId,
        tons: fixing.current.tons.replace('.', ','),
        waybillNo: fixing.current.waybillNo,
        loadingDate: fixing.current.loadingDate,
        lotNo: fixing.current.lotNo ?? '',
        routeSheetNo: fixing.current.routeSheetNo ?? '',
        container: fixing.current.container ?? '',
        reason: '',
      }
    : {
        declarationId: o.initial?.declarationId ?? '',
        allocationId: o.initial?.allocationId ?? '',
        recipientId: o.initial?.recipientId ?? '',
        carrierId: o.initial?.carrierId ?? '',
        truckId: o.initial?.truckId ?? '',
        trailerIds: o.initial?.trailerIds ?? [],
        driverId: o.initial?.driverId ?? '',
        tons: o.initial?.tons ?? '',
        waybillNo: o.initial?.waybillNo ?? '',
        loadingDate: o.initial?.loadingDate || today,
        lotNo: o.initial?.lotNo ?? '',
        routeSheetNo: o.initial?.routeSheetNo ?? '',
        container: o.initial?.container ?? '',
        reason: '',
      };

  const warn = useRef<(x: Values) => Partial<Record<keyof Values, string>>>(() => ({}));
  const form = useValidatedForm({
    schema: fixing ? correctSchema : newSchema,
    defaultValues: start,
    labels: LABELS,
    // Las advertencias usan lo que se calcula más abajo (después de leer los valores): se resuelven en cada render.
    warnings: (x) => warn.current(x),
    onSubmit: async (v) => {
      const fields = {
        recipientId: v.recipientId,
        truckId: v.truckId,
        trailerIds: v.trailerIds,
        driverId: v.driverId,
        tons: v.tons,
        waybillNo: v.waybillNo,
        loadingDate: v.loadingDate,
        lotNo: v.lotNo,
        routeSheetNo: v.routeSheetNo,
        container: v.container,
      };
      const send = async () => {
        const extra = Object.keys(overrides.current).length ? { overrides: { ...overrides.current } } : {};
        const order = fixing
          ? await base.api().request(ordersApi.correct, {
              params: { id: fixing.id },
              body: correctOrderSchema.parse({
                ...fields,
                ...extra,
                reason: v.reason,
                expectedVersion: fixing.current.versionNo,
              }),
            })
          : await base.api().request(ordersApi.issue, {
              body: issueOrderSchema.parse({
                ...fields,
                ...extra,
                declarationId: v.declarationId,
                allocationId: v.allocationId,
                ...(o.draftId ? { draftId: o.draftId } : {}),
              }),
            });
        overrides.current = {};
        setIssued(order);
        // Primero lo que depende solo de que el servidor la aceptó (borrar el borrador local): si la app se cierra
        // mientras espera la sincronización, no queda un borrador de una orden ya emitida que luego se subiría.
        await o.onDone(order);
        await base.done(
          fixing
            ? `Se emitió la versión ${order.current.versionNo} de la orden ${order.number}.`
            : `Se emitió la orden ${order.number}.`,
        );
      };
      // RF-ORD-13: capacidad y camión repetido se saltan con una decisión de excepción con motivo; si hacen falta las
      // dos, el reintento tras la primera pide la segunda.
      const attempt = async (): Promise<void> => {
        try {
          await send();
        } catch (e) {
          if (
            !(e instanceof ApiError) ||
            (e.code !== 'CAPACITY_REQUIRES_OVERRIDE' && e.code !== 'SAME_DAY_REQUIRES_OVERRIDE')
          )
            throw e;
          askOverride(e);
          retry.current = attempt;
        }
      };
      await attempt();
      function askOverride(e: ApiError) {
        const d = (e.details ?? {}) as Record<string, string | number>;
        setOverride(
          e.code === 'CAPACITY_REQUIRES_OVERRIDE'
            ? {
                kind: 'capacity',
                title: e.message,
                rule: `Toneladas ${tonsText(String(v.tons).replace(',', '.'))} · capacidad de los remolques ${tonsText(String(d.capacityTons))}. Se puede emitir con una decisión de excepción: queda en la bitácora.`,
              }
            : {
                kind: 'sameDay',
                title: e.message,
                rule: 'El mismo camión no debe tener dos órdenes con la misma fecha de carga. Se puede emitir con una decisión de excepción: queda en la bitácora.',
              },
        );
      }
    },
  });
  const retry = useRef<() => Promise<void>>(async () => undefined);

  const v = form.form.watch() as Values;
  const declaration = declarations.find((d) => d.id === v.declarationId) ?? null;
  const client = clients.find((c) => c.id === declaration?.clientId) ?? null;
  const allocation = declaration?.allocations.find((a) => a.id === v.allocationId) ?? null;
  const vessel = vessels.find((x) => x.id === allocation?.vesselId) ?? null;
  const truck = trucks.find((t) => t.id === v.truckId) ?? null;
  const driver = drivers.find((d) => d.id === v.driverId) ?? null;
  const chosenTrailers = (v.trailerIds ?? []).map((id) => trailers.find((t) => t.id === id)).filter((t) => !!t);
  const recipient = client?.recipients.find((r) => r.id === v.recipientId) ?? null;

  // P-13: al elegir la DM se propone su buque si solo hay uno; y su destinatario si solo hay uno (RF-ORD-03).
  const allocationChoices = (declaration?.allocations ?? []).filter((a) => {
    const vs = vessels.find((x) => x.id === a.vesselId);
    return fixing || (vs?.status === 'open' && !parseTons(a.balanceTons).isZero());
  });
  const recipientChoices = (client?.recipients ?? []).filter((r) => r.active || r.id === v.recipientId);
  const proposed = useRef('');
  useEffect(() => {
    if (fixing || !declaration || proposed.current === declaration.id) return;
    proposed.current = declaration.id;
    const only = allocationChoices.length === 1 ? allocationChoices[0]!.id : '';
    if (!allocationChoices.some((a) => a.id === v.allocationId))
      form.form.setValue('allocationId', only, { shouldDirty: true });
    const r = recipientChoices.length === 1 ? recipientChoices[0]!.id : '';
    if (!recipientChoices.some((x) => x.id === v.recipientId))
      form.form.setValue('recipientId', r, { shouldDirty: true });
  });

  // El transportista sale del camión (al corregir, o al abrir un borrador sin él) en cuanto la copia local lo tiene.
  useEffect(() => {
    if (truck && !v.carrierId) form.form.setValue('carrierId', truck.carrierId);
  });

  // Los habituales del camión, si son activos y del mismo transportista (ACLARAR-10).
  const lastTruck = useRef(v.truckId);
  useEffect(() => {
    if (!truck || lastTruck.current === truck.id) return;
    lastTruck.current = truck.id;
    const habitual = truck.trailerIds.filter((id) =>
      trailers.some((t) => t.id === id && t.active && t.carrierId === truck.carrierId),
    );
    form.form.setValue('trailerIds', habitual, { shouldDirty: true });
  });

  useEffect(() => {
    if (!fixing) o.onChange?.(payloadOf(v));
    // Solo cuando cambian los valores.
  }, [JSON.stringify(v)]);

  // ---------- panel de saldo y comprobaciones (RF-ORD-05) ----------
  const tons = tonsOrNull(String(v.tons ?? ''));
  const released = fixing ? parseTons(fixing.current.tons) : null;
  const balance = allocation ? parseTons(allocation.balanceTons) : null;
  const available = balance && released ? addTons(balance, released) : balance;
  const capacity = addTons(...chosenTrailers.map((t) => parseTons(t.capacityTons)));
  const others = (pick: (x: OrderDto) => string) =>
    orders.filter(
      (x) =>
        x.status === 'official' &&
        x.id !== fixing?.id &&
        x.current.loadingDate === v.loadingDate &&
        pick(x) !== '' &&
        pick(x) === (pick === truckOf ? v.truckId : v.driverId),
    ).length;
  const truckOf = (x: OrderDto) => x.current.truckId;
  const driverOf = (x: OrderDto) => x.current.driverId;
  const problems: OrderProblem[] =
    declaration && vessel && allocation && truck && driver && recipient && tons
      ? checkOrder({
          correction: fixing
            ? { currentTons: released!, firstIssueDate: havanaDate(new Date(fixing.firstIssuedAt)) }
            : null,
          today,
          maxLoadingDaysAhead: MAX_LOADING_DAYS,
          hasOfficialSeal: true,
          declaration: { number: declaration.number, status: statusOf(declaration, now) },
          vessel: { name: vessel.name, status: vessel.status, arrivalDate: vessel.arrivalDate },
          allocationBalance: balance!,
          tons,
          loadingDate: String(v.loadingDate),
          recipient: { name: recipient.name, active: recipient.active },
          truck: {
            plate: truck.plate,
            active: truck.active && !!carriers.find((c) => c.id === truck.carrierId)?.active,
            carrierId: truck.carrierId,
          },
          driver: { fullName: driver.fullName, active: driver.active, carrierId: driver.carrierId },
          trailers: chosenTrailers.map((t) => ({
            plate: t.plate,
            active: t.active,
            carrierId: t.carrierId,
            capacity: parseTons(t.capacityTons),
          })),
          sameDayOrders: others(truckOf),
          overrides: {},
        })
      : [];

  function warningsOf(x: Values): Partial<Record<keyof Values, string>> {
    const d = declarations.find((y) => y.id === x.declarationId);
    const t = tonsOrNull(String(x.tons ?? ''));
    const w: Record<string, string | undefined> = {};
    const day = d ? deadlineAt(d.deadlineStartDate, now) : null;
    if (day && !day.expired) {
      const a = adv01(day.day);
      if (a) w.declarationId = a;
    }
    if (d?.balanceTons && t) {
      const after = subTons(parseTons(d.balanceTons), released ? subTons(t, released) : t);
      w.tons = adv02(after);
    }
    if (t && !capacity.isZero()) w.tons ??= adv03(t, capacity);
    w.loadingDate = adv04(String(x.loadingDate ?? ''), today);
    w.driverId = adv07(others(driverOf));
    w.container = containerWarning(
      String(x.container ?? '')
        .toUpperCase()
        .replace(/\s+/g, ''),
    );
    return Object.fromEntries(Object.entries(w).filter(([, m]) => m)) as Partial<Record<keyof Values, string>>;
  }

  warn.current = warningsOf;
  const checks: CheckItem[] = [
    ...problems.map((p) => ({ tone: 'bad' as const, text: p.message })),
    ...Object.values(warningsOf(v)).map((text) => ({ tone: 'warn' as const, text: text! })),
  ];
  if (problems.length === 0 && tons && allocation && truck) {
    checks.unshift(
      { tone: 'ok', text: 'Cabe en el saldo de la asignación' },
      { tone: 'ok', text: 'Dentro de la capacidad de los remolques' },
      {
        tone: 'ok',
        text: `Chofer, camión y remolques de ${carriers.find((c) => c.id === truck.carrierId)?.name ?? ''}`,
      },
    );
  }

  const carrierId = String(v.carrierId ?? '');
  const ofCarrier = <T extends { carrierId: string; active: boolean; id: string }>(list: T[], keep: string[]) =>
    list.filter((x) => (x.carrierId === carrierId && x.active) || keep.includes(x.id));

  return {
    ...base,
    form,
    fixing,
    today,
    declaration,
    vessel,
    client,
    recipient,
    truck,
    driver,
    carrierName: (id: string) => carriers.find((c) => c.id === id)?.name ?? '',
    /** Las DM que admiten órdenes: activas y con saldo en algún buque abierto (RF-DM-07). */
    declarationOptions: declarations
      .filter((d) => statusOf(d, now) === 'active')
      .map((d) => ({
        value: d.id,
        label: `${d.number} · ${clients.find((c) => c.id === d.clientId)?.name ?? ''} · ${d.brand}`,
      })),
    allocationOptions: allocationChoices.map((a) => ({
      value: a.id,
      label: `${vessels.find((x) => x.id === a.vesselId)?.name ?? ''} · saldo ${tonsText(a.balanceTons)}`,
    })),
    recipientOptions: recipientChoices.map((r) => ({ value: r.id, label: r.name })),
    carrierOptions: carriers.filter((c) => c.active || c.id === carrierId).map((c) => ({ value: c.id, label: c.name })),
    truckOptions: ofCarrier(trucks, [String(v.truckId)]).map((t) => ({ value: t.id, label: t.plate })),
    driverOptions: ofCarrier(drivers, [String(v.driverId)]).map((d) => ({ value: d.id, label: d.fullName })),
    trailerChoices: ofCarrier(trailers, v.trailerIds ?? []),
    trailerIds: v.trailerIds ?? [],
    toggleTrailer: (id: string) => {
      const now = v.trailerIds ?? [];
      form.form.setValue('trailerIds', now.includes(id) ? now.filter((x) => x !== id) : [...now, id], {
        shouldDirty: true,
        shouldValidate: form.form.formState.isSubmitted,
      });
    },
    trailersError: form.form.formState.errors.trailerIds?.message as string | undefined,
    fields: Object.fromEntries(
      (Object.keys(LABELS) as (keyof typeof LABELS)[]).filter((k) => k !== 'trailerIds').map((k) => [k, form.field(k)]),
    ) as Record<Exclude<keyof typeof LABELS, 'trailerIds'>, ReturnType<typeof form.field>>,
    panel: {
      balance: available ? formatTons(available) : '—',
      thisOrder: tons ? formatTons(tons) : '—',
      after: available && tons ? formatTons(subTons(available, tons)) : '—',
      capacity: formatTons(capacity),
      overdraft: !!(available && tons && tons.greaterThan(available)),
    },
    checks,
    blocking: problems.find((p) => p.code !== 'CAPACITY_REQUIRES_OVERRIDE' && p.code !== 'SAME_DAY_REQUIRES_OVERRIDE'),
    summary: form.summary,
    formError: form.formError,
    saving: form.form.formState.isSubmitting,
    submit: form.submit,
    values: v,
    issued,
    resetIssued: () => setIssued(null),
    override,
    cancelOverride: () => setOverride(null),
    confirmOverride: (reason: string) => {
      overrides.current[override!.kind] = reason;
      setOverride(null);
      void base.act('emitir', () => retry.current());
    },
    /** RF-ORD-21: el original (24 h, quien emitió) o una copia, guardado con «Guardar como» o en Descargas. */
    download: (order: OrderDto, versionNo = order.current.versionNo) =>
      void base.act('descargar', async () => {
        const file = await base.api().request(ordersApi.pdf, { params: { id: order.id, n: String(versionNo) } });
        await session.saveFile(
          file.fileName,
          Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0)),
        );
        base.setNotice({
          tone: 'info',
          text:
            file.kind === 'original'
              ? `Se descargó el original de ${order.number}.`
              : `Se descargó una copia de ${order.number}.`,
        });
      }),
  };
}

export type OrderFormModel = ReturnType<typeof useOrderForm>;
