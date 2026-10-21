// T071 · P-07 Buques y P-08 Ficha de buque (plan §7.3). RF-BUQ-01 a 09, F-07, F-09, F-10. Se lee de la copia local
// (saldos calculados por el servidor); el sobrante y el historial se consultan al servidor al abrir su pestaña.
import { havanaDate, parseTons, vesselCode } from '@impocaribe/shared';
import {
  allocationSchema,
  arrivalSchema,
  editVesselSchema,
  etaWarning,
  SURPLUS_KIND_LABEL,
  surplusDispositionSchema,
  tonsSchema,
  vesselSchema,
  type DeclarationDto,
  type ClientDto,
  type VesselDto,
  type VesselHistory,
  type VesselSurplus,
} from '@impocaribe/shared/validation';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { ApiError } from '../../api/client';
import { declarationsApi, vesselsApi } from '../../api/endpoints/vessels';
import { useAppSession } from '../../session/SessionProvider';
import { useRecentlyChanged, useServerNow } from '../../sync/SyncProvider';
import { useValidatedForm } from '../../validation/useValidatedForm';
import { byText, useCatalog, useLocal } from '../catalogs/useCatalog';
import { statusOf, tonsText, type Exceeds } from '../declarations/useDeclarations';

export type VesselTab = 'summary' | 'declarations' | 'surplus' | 'history';
type Mode = 'detail' | 'new' | 'edit' | 'arrival' | 'assign' | 'dispose';
type Loaded<T> = T | 'loading' | 'error' | null;

/** «Eagle 1 · V2» */
export const vesselLabel = (v: VesselDto) => `${v.name}${v.voyageNo ? ` · V${v.voyageNo}` : ''}`;
/** Texto de un número en pantalla para volver a editarlo ("50000.000" → "50000,000"). */
const editable = (tons: string) => tons.replace('.', ',');

const assignFormSchema = z
  .object({ declarationId: z.uuid({ error: 'Elija la DM.' }), tons: z.string() })
  .superRefine((v, ctx) => {
    const r = tonsSchema('Escriba las toneladas.').safeParse(v.tons);
    if (!r.success) ctx.addIssue({ code: 'custom', path: ['tons'], message: r.error.issues[0]!.message });
  });

const EMPTY_VESSEL = {
  name: '',
  manifest: '',
  bl: '',
  port: '',
  internalBuyer: '',
  etaDate: '',
  arrivalDate: '',
  totalTons: '',
};
const VESSEL_LABELS = {
  name: 'Nombre',
  manifest: 'Manifiesto',
  bl: 'B/L',
  port: 'Puerto y terminal',
  internalBuyer: 'Comprador interno',
  etaDate: 'Fecha de arribo estimada',
  arrivalDate: 'Fecha de arribo real',
  totalTons: 'Total (t)',
};

// La fecha real no se edita aquí: tiene su propia acción (RF-BUQ-03, 07).
const EDIT_EMPTY = { name: '', manifest: '', bl: '', port: '', internalBuyer: '', etaDate: '', totalTons: '' };
const EDIT_LABELS = {
  name: VESSEL_LABELS.name,
  manifest: VESSEL_LABELS.manifest,
  bl: VESSEL_LABELS.bl,
  port: VESSEL_LABELS.port,
  internalBuyer: VESSEL_LABELS.internalBuyer,
  etaDate: VESSEL_LABELS.etaDate,
  totalTons: VESSEL_LABELS.totalTons,
};

export function useVessels() {
  const base = useCatalog();
  const { state } = useAppSession();
  const now = useServerNow()();
  const today = havanaDate(now);
  const navigate = useNavigate();
  const { id: selectedId } = useParams();
  const vessels = useLocal<VesselDto>(
    'vessel',
    byText((v) => v.name),
  );
  const declarations = useLocal<DeclarationDto>(
    'declaration',
    byText((d) => d.number),
  );
  const clients = useLocal<ClientDto>(
    'client',
    byText((c) => c.name),
  );
  const changed = useRecentlyChanged('vessel');
  const [mode, setMode] = useState<Mode>('detail');
  const [tab, setTab] = useState<VesselTab>('summary');
  const [surplus, setSurplus] = useState<Loaded<VesselSurplus>>(null);
  const [history, setHistory] = useState<Loaded<VesselHistory>>(null);
  const [exceeds, setExceeds] = useState<Exceeds | null>(null);
  const exceedsNo = useRef<() => void>(() => undefined);
  const [confirmClose, setConfirmClose] = useState(false);

  const selected = vessels.find((v) => v.id === selectedId) ?? null;
  const vesselName = (id: string | null) => vessels.find((v) => v.id === id)?.name ?? '';
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? '';
  const open = (id: string | null) => navigate(id ? `/buques/${id}` : '/buques');
  const role = state.session!.user.role;

  // ---------- Alta y edición (F-07) ----------
  const create = useValidatedForm({
    schema: vesselSchema,
    defaultValues: EMPTY_VESSEL,
    labels: VESSEL_LABELS,
    warnings: (v) => {
      const w = etaWarning(String(v.etaDate ?? '') || null, String(v.arrivalDate ?? '') || null, today);
      return w ? { etaDate: w } : {};
    },
    onSubmit: async (values) => {
      const v = await base.api().request(vesselsApi.create, { body: values });
      await base.done(`Se creó el buque ${v.name}.`);
      // El aviso de cambios sin guardar se apaga antes de ir a la ficha: si no, bloquea la navegación.
      flushSync(() => {
        create.reset(EMPTY_VESSEL);
        setMode('detail');
      });
      open(v.id);
    },
  });
  const edit = useValidatedForm({
    schema: editVesselSchema,
    defaultValues: { ...EDIT_EMPTY, reason: '', expectedVersion: 0 },
    labels: { ...EDIT_LABELS, reason: 'Motivo', expectedVersion: 'Versión' },
    onSubmit: async (values) => {
      await base.api().request(vesselsApi.edit, { params: { id: selected!.id }, body: values });
      setMode('detail');
      await base.done(`Se guardaron los cambios del buque ${values.name}.`);
    },
  });
  const nameNow = String((mode === 'new' ? create.form.watch('name') : edit.form.watch('name')) ?? '');

  // ---------- Arribo real (RF-BUQ-03, 07) ----------
  const arrival = useValidatedForm({
    schema: arrivalSchema,
    defaultValues: { arrivalDate: '', reason: '', expectedVersion: 0 },
    labels: { arrivalDate: 'Fecha de arribo real', reason: 'Motivo', expectedVersion: 'Versión' },
    onSubmit: async (values) => {
      const v = await base.api().request(vesselsApi.arrival, { params: { id: selected!.id }, body: values });
      setMode('detail');
      await base.done(`Se registró el arribo del buque ${v.name}: viaje V${v.voyageNo}.`);
    },
  });

  // ---------- Asignar una DM (F-09, HU-04) ----------
  const assign = useValidatedForm({
    schema: assignFormSchema,
    defaultValues: { declarationId: '', tons: '' },
    labels: { declarationId: 'DM', tons: 'Toneladas' },
    onSubmit: async (values) => {
      const v = selected!;
      const send = async (extra: { confirmPartial?: boolean; reason?: string }) => {
        await base.api().request(declarationsApi.allocate, {
          params: { id: values.declarationId },
          body: allocationSchema.parse({ vesselId: v.id, tons: values.tons, ...extra }),
        });
        setMode('detail');
        const d = declarations.find((x) => x.id === values.declarationId);
        await base.done(`Se asignó la DM ${d?.number ?? ''} al buque ${v.name}.`);
      };
      try {
        await send({});
      } catch (e) {
        if (!(e instanceof ApiError) || e.code !== 'ALLOCATION_EXCEEDS_VESSEL') throw e;
        const free = String(e.details?.freeTons ?? '0');
        if (parseTons(free).isZero()) throw e;
        exceedsNo.current = () => assign.form.setValue('declarationId', '', { shouldDirty: true });
        setExceeds({
          title: e.message,
          free,
          confirm: async (reason) => {
            setExceeds(null);
            await base.act('exceeds', () => send({ confirmPartial: true, reason }));
          },
        });
      }
    },
  });

  // ---------- Destino del sobrante (F-10) ----------
  const dispose = useValidatedForm({
    schema: surplusDispositionSchema,
    defaultValues: { kind: 'transfer', tons: '', targetVesselId: '', targetDeclarationId: '', reason: '' },
    labels: {
      kind: 'Tipo de destino',
      tons: 'Toneladas',
      targetVesselId: 'Buque destino',
      targetDeclarationId: 'DM',
      reason: 'Motivo',
    },
    onSubmit: async (values) => {
      const s = await base.api().request(vesselsApi.dispose, { params: { id: selected!.id }, body: values });
      setSurplus(s);
      setMode('detail');
      setTab('surplus');
      await base.done(`Se registró el destino: ${SURPLUS_KIND_LABEL[values.kind].toLowerCase()}.`);
    },
  });
  const disposeKind = String(dispose.form.watch('kind') ?? 'transfer');

  // ---------- Sobrante e historial (al abrir su pestaña) ----------
  useEffect(() => {
    if (!selected || (tab !== 'surplus' && tab !== 'history')) return;
    let alive = true;
    const [set, endpoint] = tab === 'surplus' ? [setSurplus, vesselsApi.surplus] : [setHistory, vesselsApi.history];
    (set as (v: unknown) => void)('loading');
    base
      .api()
      .request(endpoint as typeof vesselsApi.surplus, { params: { id: selected.id } })
      .then(
        (r) => alive && (set as (v: unknown) => void)(r),
        () => alive && (set as (v: unknown) => void)('error'),
      );
    return () => {
      alive = false;
    };
    // Solo al abrir la pestaña o cambiar de buque (o de versión).
  }, [tab, selected?.id, selected?.rowVersion]);

  /** Las DM que aún pueden recibir toneladas: con pendiente de asignar, sin vencer ni cerrar (RF-ASG-01). */
  const assignable = declarations.filter((d) => {
    const s = statusOf(d, now);
    return (
      (s === 'active' || s === 'pending_allocation') &&
      d.pendingAllocationTons &&
      !parseTons(d.pendingAllocationTons).isZero()
    );
  });
  const unresolved = selected ? parseTons(selected.unresolvedSurplusTons) : null;

  return {
    ...base,
    vessels,
    changed,
    selected,
    vesselName,
    clientName,
    /** P-08, pestaña DM: las DM con asignación en este buque. */
    declarationsOf: (v: VesselDto) =>
      declarations.flatMap((d) =>
        d.allocations.filter((a) => a.vesselId === v.id).map((a) => ({ declaration: d, allocation: a })),
      ),
    mode: selected || mode === 'new' ? mode : 'detail',
    tab,
    setTab,
    surplus,
    history,
    open: (id: string) => {
      base.setNotice(null);
      setMode('detail');
      setTab('summary');
      open(id);
    },
    close: () => {
      setMode('detail');
      open(null);
    },
    cancelMode: () => setMode('detail'),

    code: vesselCode(nameNow),
    openNew: () => {
      base.setNotice(null);
      create.reset(EMPTY_VESSEL);
      setMode('new');
      open(null);
    },
    createFields: Object.fromEntries(
      (Object.keys(EMPTY_VESSEL) as (keyof typeof EMPTY_VESSEL)[]).map((k) => [k, create.field(k)]),
    ) as Record<keyof typeof EMPTY_VESSEL, ReturnType<typeof create.field>>,
    createSummary: create.summary,
    createError: create.formError,
    creating: create.form.formState.isSubmitting,
    submitCreate: create.submit,
    createDirty: create.dirty,

    openEdit: () => {
      base.setNotice(null);
      const v = selected!;
      edit.reset({
        name: v.name,
        manifest: v.manifest,
        bl: v.bl,
        port: v.port,
        internalBuyer: v.internalBuyer,
        etaDate: v.etaDate ?? '',
        totalTons: editable(v.totalTons),
        reason: '',
        expectedVersion: v.rowVersion,
      });
      setMode('edit');
    },
    editFields: {
      name: edit.field('name'),
      manifest: edit.field('manifest'),
      bl: edit.field('bl'),
      port: edit.field('port'),
      internalBuyer: edit.field('internalBuyer'),
      etaDate: edit.field('etaDate'),
      totalTons: edit.field('totalTons'),
      reason: edit.field('reason'),
    },
    editSummary: edit.summary,
    editError: edit.formError,
    editing: edit.form.formState.isSubmitting,
    submitEdit: edit.submit,
    editDirty: edit.dirty,

    /** RF-BUQ-07: con órdenes emitidas, la fecha real ya no cambia. */
    arrivalLocked: selected?.hasOrders
      ? 'El buque ya tiene órdenes emitidas: su fecha de arribo real fija el año y el viaje de números ya impresos.'
      : undefined,
    openArrival: () => {
      base.setNotice(null);
      arrival.reset({ arrivalDate: selected!.arrivalDate ?? '', reason: '', expectedVersion: selected!.rowVersion });
      setMode('arrival');
    },
    arrivalFields: { arrivalDate: arrival.field('arrivalDate'), reason: arrival.field('reason') },
    arrivalSummary: arrival.summary,
    arrivalError: arrival.formError,
    savingArrival: arrival.form.formState.isSubmitting,
    submitArrival: arrival.submit,
    arrivalDirty: arrival.dirty,

    closedReason: selected?.status === 'closed' ? `El buque ${selected.name} está cerrado.` : undefined,
    openAssign: () => {
      base.setNotice(null);
      assign.reset({ declarationId: '', tons: '' });
      setMode('assign');
    },
    declarationOptions: assignable.map((d) => ({
      value: d.id,
      label: `${d.number} · ${clientName(d.clientId)} · pendiente ${tonsText(d.pendingAllocationTons)}`,
    })),
    assignFields: { declarationId: assign.field('declarationId'), tons: assign.field('tons') },
    assignSummary: assign.summary,
    assignError: assign.formError,
    assigning: assign.form.formState.isSubmitting,
    submitAssign: assign.submit,
    assignDirty: assign.dirty,
    exceeds,
    exceedsNo: () => {
      setExceeds(null);
      exceedsNo.current();
    },

    /** F-10: la merma solo la registra una Apoderada. */
    kindOptions: (['allocate', 'transfer', 'loss'] as const)
      .filter((k) => k !== 'loss' || role === 'apoderada')
      .map((k) => ({ value: k, label: SURPLUS_KIND_LABEL[k] })),
    disposeKind,
    targetVesselOptions: vessels
      .filter((v) => v.status === 'open' && v.id !== selected?.id)
      .map((v) => ({ value: v.id, label: vesselLabel(v) })),
    openDispose: () => {
      base.setNotice(null);
      dispose.reset({ kind: 'transfer', tons: '', targetVesselId: '', targetDeclarationId: '', reason: '' });
      setMode('dispose');
    },
    disposeFields: {
      kind: dispose.field('kind'),
      tons: dispose.field('tons'),
      targetVesselId: dispose.field('targetVesselId'),
      targetDeclarationId: dispose.field('targetDeclarationId'),
      reason: dispose.field('reason'),
    },
    disposeSummary: dispose.summary,
    disposeError: dispose.formError,
    disposing: dispose.form.formState.isSubmitting,
    submitDispose: dispose.submit,
    disposeDirty: dispose.dirty,

    /** RF-BUQ-08: «Cerrar» se desactiva mientras falte destino, diciendo cuánto. */
    closeBlocked:
      unresolved && !unresolved.isZero()
        ? `Faltan ${tonsText(selected!.unresolvedSurplusTons)} de sobrante por darle destino.`
        : undefined,
    confirmClose,
    askClose: () => setConfirmClose(true),
    cancelClose: () => setConfirmClose(false),
    closeVessel: () =>
      void base.act('cerrar', async () => {
        const v = selected!;
        await base.api().request(vesselsApi.close, { params: { id: v.id }, body: { expectedVersion: v.rowVersion } });
        setConfirmClose(false);
        await base.done(`El buque ${v.name} quedó cerrado.`);
      }),
  };
}

export type VesselsModel = ReturnType<typeof useVessels>;
