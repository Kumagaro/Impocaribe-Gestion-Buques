// T072 · P-09 DM, P-10 Ficha de DM y P-11 Alta y edición (plan §7.3). RF-DM-01 a 13, RF-ASG-01 a 03, RF-PLZ-04, 05,
// HU-04, HU-09. Se lee de la copia local (saldos calculados por el servidor); el estado y el plazo se calculan con la
// hora del servidor. Si la asignación supera lo libre del buque, se pregunta (RF-ASG-02).
import {
  DECLARATION_STATUS_LABEL,
  deadlineAt,
  declarationStatus,
  formatTons,
  havanaDate,
  lastDeadlineDate,
  parseTons,
  type DeclarationStatus,
} from '@impocaribe/shared';
import {
  allocationSchema,
  declarationNumberSchema,
  declarationSchema,
  DEFAULT_LEGAL_NOTICE,
  editDeclarationSchema,
  PENDING_TOTAL_WARNING,
  tonsSchema,
  type ClientDto,
  type DeclarationDto,
  type DeclarationHistory,
  type VesselDto,
} from '@impocaribe/shared/validation';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { ApiError } from '../../api/client';
import { declarationsApi } from '../../api/endpoints/vessels';
import { useRecentlyChanged, useServerNow } from '../../sync/SyncProvider';
import { useValidatedForm } from '../../validation/useValidatedForm';
import { byText, useCatalog, useLocal } from '../catalogs/useCatalog';

export const tonsText = (s: string | null) => (s === null ? '—' : formatTons(parseTons(s)));
export const dateText = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** RF-DM-06 con la hora del servidor. */
export function statusOf(d: DeclarationDto, now: Date): DeclarationStatus {
  return declarationStatus({
    total: d.totalTons === null ? null : parseTons(d.totalTons),
    allocations: d.allocations.map((a) => ({ allocated: parseTons(a.allocatedTons), loaded: parseTons(a.loadedTons) })),
    expired: d.expiredAt !== null || deadlineAt(d.deadlineStartDate, now).expired,
  });
}

/** «79,0» */
export function progressOf(d: DeclarationDto): string {
  if (d.totalTons === null) return '0,0';
  const total = parseTons(d.totalTons);
  return total.isZero() ? '0,0' : parseTons(d.loadedTons).div(total).times(100).toFixed(1).replace('.', ',');
}

/** Etapas de P-10: Pendiente → Asignada → En extracción → Entregada, o Vencida. */
export function stageOf(d: DeclarationDto, status: DeclarationStatus): number | 'expired' {
  if (status === 'expired') return 'expired';
  if (status === 'closed') return 3;
  if (!parseTons(d.loadedTons).isZero()) return 2;
  return d.allocations.some((a) => !parseTons(a.allocatedTons).isZero()) ? 1 : 0;
}
export const STAGES = ['Pendiente', 'Asignada', 'En extracción', 'Entregada'];

export const STATUS_TONE: Record<DeclarationStatus, 'ok' | 'warn' | 'bad' | 'info' | 'mute'> = {
  active: 'ok',
  pending_allocation: 'warn',
  pending_total: 'info',
  expired: 'bad',
  closed: 'mute',
};
export const FILTERS: ('all' | DeclarationStatus)[] = [
  'all',
  'active',
  'pending_allocation',
  'pending_total',
  'expired',
  'closed',
];
export const filterLabel = (f: 'all' | DeclarationStatus) => (f === 'all' ? 'Todas' : DECLARATION_STATUS_LABEL[f]);

export type DeclarationsPanel = { kind: 'detail' } | { kind: 'new' } | { kind: 'edit' } | { kind: 'allocate' } | null;

/** P-11, alta: los datos de F-08 y, opcional, la asignación de F-09 en el mismo formulario. */
const newFormSchema = z
  .object({
    number: declarationNumberSchema,
    clientId: z.uuid({ error: 'Elija el cliente.' }),
    brand: z.string(),
    totalTons: z.string(),
    vesselId: z.string(),
    allocationTons: z.string(),
  })
  .superRefine((v, ctx) => {
    const brand = v.brand.trim();
    if (brand === '') ctx.addIssue({ code: 'custom', path: ['brand'], message: 'Escriba la marca.' });
    else if (brand.length < 2 || brand.length > 60)
      ctx.addIssue({
        code: 'custom',
        path: ['brand'],
        message: `La marca debe tener entre 2 y 60 caracteres (tiene ${brand.length}).`,
      });
    if (v.totalTons !== '') {
      const r = tonsSchema('Escriba el total en toneladas.').safeParse(v.totalTons);
      if (!r.success) ctx.addIssue({ code: 'custom', path: ['totalTons'], message: r.error.issues[0]!.message });
    }
    if (v.vesselId !== '') {
      if (v.totalTons === '')
        ctx.addIssue({ code: 'custom', path: ['vesselId'], message: 'Una DM sin total no se puede asignar.' });
      const r = tonsSchema('Escriba las toneladas.').safeParse(v.allocationTons);
      if (!r.success) ctx.addIssue({ code: 'custom', path: ['allocationTons'], message: r.error.issues[0]!.message });
    }
  });

const allocateFormSchema = z
  .object({ vesselId: z.uuid({ error: 'Elija el buque.' }), tons: z.string() })
  .superRefine((v, ctx) => {
    const r = tonsSchema('Escriba las toneladas.').safeParse(v.tons);
    if (!r.success) ctx.addIssue({ code: 'custom', path: ['tons'], message: r.error.issues[0]!.message });
  });

/** HU-04: lo que se pregunta cuando la asignación supera lo libre del buque. */
export interface Exceeds {
  title: string;
  free: string;
  confirm: (reason: string) => Promise<void>;
}

export function useDeclarations() {
  const base = useCatalog();
  const serverNow = useServerNow();
  const now = serverNow();
  const navigate = useNavigate();
  const { id: selectedId } = useParams();
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
  const changed = useRecentlyChanged('declaration');
  const [filter, setFilter] = useState<'all' | DeclarationStatus>('all');
  const [vesselFilter, setVesselFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'detail' | 'new' | 'edit' | 'allocate'>('detail');
  const [tab, setTab] = useState<'summary' | 'history'>('summary');
  const [history, setHistory] = useState<DeclarationHistory | 'loading' | 'error' | null>(null);
  const [exceeds, setExceeds] = useState<Exceeds | null>(null);
  const [reactivating, setReactivating] = useState(false);
  /** «No» del diálogo de HU-04: deja el buque vacío. */
  const exceedsNo = useRef<() => void>(() => undefined);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? '';
  const vesselOf = (id: string) => vessels.find((v) => v.id === id);
  const selected = declarations.find((d) => d.id === selectedId) ?? null;
  const statuses = new Map(declarations.map((d) => [d.id, statusOf(d, now)]));
  const status = (d: DeclarationDto) => statuses.get(d.id) ?? statusOf(d, now);

  // P-09: los filtros. Los contadores cuentan con los demás filtros aplicados.
  const q = search.trim().toLowerCase();
  const matches = (d: DeclarationDto) =>
    (!vesselFilter || d.allocations.some((a) => a.vesselId === vesselFilter)) &&
    (!clientFilter || d.clientId === clientFilter) &&
    (!q ||
      d.number.includes(q) ||
      clientName(d.clientId).toLowerCase().includes(q) ||
      d.brand.toLowerCase().includes(q));
  const base0 = declarations.filter(matches);
  const counts = Object.fromEntries(
    FILTERS.map((f) => [f, f === 'all' ? base0.length : base0.filter((d) => status(d) === f).length]),
  ) as Record<'all' | DeclarationStatus, number>;
  const shown = filter === 'all' ? base0 : base0.filter((d) => status(d) === filter);

  /** Solo buques abiertos (RF-ASG-01), con lo libre en la etiqueta. */
  const vesselOptions = vessels
    .filter((v) => v.status === 'open')
    .map((v) => ({
      value: v.id,
      label: `${v.name}${v.voyageNo ? ` · V${v.voyageNo}` : ''} · libre ${tonsText(v.freeTons)}`,
    }));
  const clientOptions = clients.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }));

  const open = (id: string | null) => navigate(id ? `/dm/${id}` : '/dm');

  /** RF-ASG-02: si el servidor dice que supera lo libre, pregunta; con «Sí» y motivo, reenvía. */
  const askIfExceeds = async (
    send: (extra: { confirmPartial?: boolean; reason?: string }) => Promise<void>,
    onNo: () => void,
  ) => {
    try {
      await send({});
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'ALLOCATION_EXCEEDS_VESSEL') throw e;
      const free = String(e.details?.freeTons ?? '0');
      if (parseTons(free).isZero()) throw e;
      setExceeds({
        title: e.message,
        free,
        confirm: async (reason) => {
          setExceeds(null);
          await base.act('exceeds', () => send({ confirmPartial: true, reason }));
        },
      });
      // «No»: no se asigna y el buque queda vacío.
      exceedsNo.current = onNo;
    }
  };

  // ---------- Alta (P-11) ----------
  const create = useValidatedForm({
    schema: newFormSchema,
    defaultValues: { number: '', clientId: '', brand: '', totalTons: '', vesselId: '', allocationTons: '' },
    labels: {
      number: 'Número de DM',
      clientId: 'Cliente',
      brand: 'Marca',
      totalTons: 'Total (t)',
      vesselId: 'Buque',
      allocationTons: 'Toneladas',
    },
    warnings: (v) => (v.totalTons === '' ? { totalTons: PENDING_TOTAL_WARNING } : {}),
    onSubmit: async (v) => {
      const body = declarationSchema.parse({
        number: v.number,
        clientId: v.clientId,
        brand: v.brand,
        totalTons: v.totalTons,
        ...(v.vesselId ? { allocation: { vesselId: v.vesselId, tons: v.allocationTons } } : {}),
      });
      await askIfExceeds(
        async (extra) => {
          const d = await base.api().request(declarationsApi.create, {
            body: { ...body, ...(body.allocation ? { allocation: { ...body.allocation, ...extra } } : {}) },
          });
          await base.done(`Se creó la DM ${d.number}.`);
          // El aviso de cambios sin guardar se apaga antes de ir a la ficha: si no, bloquea la navegación.
          flushSync(() => {
            create.reset();
            setMode('detail');
          });
          open(d.id);
        },
        () => create.form.setValue('vesselId', '', { shouldDirty: true }),
      );
    },
  });
  const sameNumber = declarations.find((d) => d.number === create.form.watch('number'));

  // ---------- Edición (RF-DM-04, 05) ----------
  const edit = useValidatedForm({
    schema: editDeclarationSchema,
    defaultValues: { brand: '', totalTons: '', reason: '', expectedVersion: 0 },
    labels: { brand: 'Marca', totalTons: 'Total (t)', reason: 'Motivo', expectedVersion: 'Versión' },
    warnings: (v) => (v.totalTons === '' ? { totalTons: PENDING_TOTAL_WARNING } : {}),
    onSubmit: async (v) => {
      const d = await base.api().request(declarationsApi.edit, { params: { id: selected!.id }, body: v });
      setMode('detail');
      await base.done(`Se guardó la versión ${d.versionNo} de la DM ${d.number}.`);
    },
  });

  // ---------- Asignar (F-09) ----------
  const assign = useValidatedForm({
    schema: allocateFormSchema,
    defaultValues: { vesselId: '', tons: '' },
    labels: { vesselId: 'Buque', tons: 'Toneladas' },
    onSubmit: async (v) => {
      const d = selected!;
      await askIfExceeds(
        async (extra) => {
          await base.api().request(declarationsApi.allocate, {
            params: { id: d.id },
            body: allocationSchema.parse({ vesselId: v.vesselId, tons: v.tons, ...extra }),
          });
          setMode('detail');
          await base.done(`Se asignó la DM ${d.number} al buque ${vesselOf(v.vesselId)?.name ?? ''}.`);
        },
        () => assign.form.setValue('vesselId', '', { shouldDirty: true }),
      );
    },
  });

  // ---------- Historial (P-10) ----------
  useEffect(() => {
    if (tab !== 'history' || !selected) return;
    let alive = true;
    setHistory('loading');
    base
      .api()
      .request(declarationsApi.history, { params: { id: selected.id } })
      .then(
        (h) => alive && setHistory(h),
        () => alive && setHistory('error'),
      );
    return () => {
      alive = false;
    };
    // Solo al abrir la pestaña o cambiar de DM (o de versión).
  }, [tab, selected?.id, selected?.rowVersion]);

  const deadline = selected ? deadlineAt(selected.deadlineStartDate, now) : null;
  const selectedStatus = selected ? status(selected) : null;

  return {
    ...base,
    declarations,
    shown,
    counts,
    changed,
    status,
    dayOf: (d: DeclarationDto) => deadlineAt(d.deadlineStartDate, now).day,
    clientName,
    vesselOf,
    vessels,
    filter,
    setFilter,
    vesselFilter,
    setVesselFilter,
    clientFilter,
    setClientFilter,
    search,
    setSearch,
    vesselOptions,
    clientOptions,
    vesselFilterOptions: vessels.map((v) => ({ value: v.id, label: v.name })),
    clientFilterOptions: clients.map((c) => ({ value: c.id, label: c.name })),

    selected,
    selectedStatus,
    mode: selected || mode === 'new' ? mode : 'detail',
    panelOpen: mode === 'new' || selected !== null,
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
    tab,
    setTab,
    history,
    deadline,
    lastDay: selected ? lastDeadlineDate(selected.deadlineStartDate) : null,
    stage: selected && selectedStatus ? stageOf(selected, selectedStatus) : 0,
    // shortcut: el aviso legal es el de por defecto; el que ajuste una Apoderada (RF-CFG-02) se verá aquí cuando la
    // configuración se replique a todos (con las alertas, F7).
    legalNotice: DEFAULT_LEGAL_NOTICE,
    today: dateText(havanaDate(now)),

    openNew: () => {
      base.setNotice(null);
      create.reset();
      setMode('new');
      open(null);
    },
    createFields: {
      number: create.field('number'),
      clientId: create.field('clientId'),
      brand: create.field('brand'),
      totalTons: create.field('totalTons'),
      vesselId: create.field('vesselId'),
      allocationTons: create.field('allocationTons'),
    },
    numberReason: sameNumber ? `La DM ${sameNumber.number} ya existe: el número no se repite nunca.` : undefined,
    createSummary: create.summary,
    createError: create.formError,
    creating: create.form.formState.isSubmitting,
    submitCreate: create.submit,
    createDirty: create.dirty,
    /** TEL: el alta va en dos pasos (Datos → Asignación opcional). */
    nextCreateStep: () => create.form.trigger(['number', 'clientId', 'brand', 'totalTons']),

    openEdit: () => {
      base.setNotice(null);
      const d = selected!;
      edit.reset({
        brand: d.brand,
        totalTons: d.totalTons === null ? '' : d.totalTons.replace('.', ','),
        reason: '',
        expectedVersion: d.rowVersion,
      });
      setMode('edit');
    },
    editFields: { brand: edit.field('brand'), totalTons: edit.field('totalTons'), reason: edit.field('reason') },
    editSummary: edit.summary,
    editError: edit.formError,
    editing: edit.form.formState.isSubmitting,
    submitEdit: edit.submit,
    editDirty: edit.dirty,

    /** D11: sin total no se asigna; tampoco vencida o cerrada (RF-ASG-01). */
    assignBlocked: !selectedStatus
      ? undefined
      : selectedStatus === 'pending_total'
        ? 'Registre el total de la DM antes de asignarla a un buque.'
        : selectedStatus === 'expired'
          ? 'La DM está vencida: reactívela para asignarla.'
          : selectedStatus === 'closed'
            ? 'La DM está cerrada: ya se cargó todo su total.'
            : selected && parseTons(selected.pendingAllocationTons ?? '0').isZero()
              ? 'La DM ya tiene asignado todo su total.'
              : undefined,
    openAssign: () => {
      base.setNotice(null);
      assign.reset({ vesselId: '', tons: '' });
      setMode('allocate');
    },
    assignFields: { vesselId: assign.field('vesselId'), tons: assign.field('tons') },
    assignSummary: assign.summary,
    assignError: assign.formError,
    assigning: assign.form.formState.isSubmitting,
    submitAssign: assign.submit,
    assignDirty: assign.dirty,
    cancelMode: () => setMode('detail'),

    exceeds,
    exceedsNo: () => {
      setExceeds(null);
      exceedsNo.current();
    },

    reactivating,
    askReactivate: () => setReactivating(true),
    cancelReactivate: () => setReactivating(false),
    reactivate: (reason: string) =>
      void base.act('reactivar', async () => {
        const d = selected!;
        await base.api().request(declarationsApi.reactivate, {
          params: { id: d.id },
          body: { reason, expectedVersion: d.rowVersion },
        });
        setReactivating(false);
        await base.done(`La DM ${d.number} se reactivó: el plazo empieza hoy.`);
      }),
  };
}

export type DeclarationsModel = ReturnType<typeof useDeclarations>;
