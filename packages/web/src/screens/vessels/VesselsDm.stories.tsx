import { DEFAULT_LEGAL_NOTICE, type DeclarationDto, type VesselDto } from '@impocaribe/shared/validation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeclarationsDesktop } from '../declarations/Declarations.desktop';
import { DeclarationsPhone } from '../declarations/Declarations.phone';
import { DeclarationsTablet } from '../declarations/Declarations.tablet';
import type { DeclarationsModel } from '../declarations/useDeclarations';
import { statusOf } from '../declarations/useDeclarations';
import { asyncNoop, field, inDevice, noop } from '../story-helpers';
import type { VesselsModel } from './useVessels';
import { VesselsDesktop } from './Vessels.desktop';
import { VesselsPhone } from './Vessels.phone';
import { VesselsTablet } from './Vessels.tablet';

// T071 y T072 · P-07 a P-11 (ui-spec y maqueta T070): cada estado con un modelo fijo, sin servidor. Buques, clientes
// y números son ficticios. La fecha de referencia es el 14/10/2026.
const meta: Meta = { title: 'Pantallas/Buques y DM' };
export default meta;

const NOW = new Date('2026-10-14T16:00:00.000Z');
const id = (n: number) => `0199f0a1-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`;
const CLIENTS: Record<string, string> = { [id(1)]: 'Nuevos Tiempos S.R.L.', [id(2)]: 'Empresa Mayorista Pinar' };

const vessel = (n: number, name: string, extra: Partial<VesselDto> = {}): VesselDto => ({
  id: id(n),
  name,
  code: name.toUpperCase().replace(/[^A-Z0-9]/g, ''),
  manifest: '0080/2026',
  bl: 'BL-2026-0412',
  port: 'Mariel, terminal 2',
  internalBuyer: 'IMPOCARIBE S.A.',
  etaDate: null,
  arrivalDate: '2026-08-30',
  voyageNo: 2,
  totalTons: '50000.000',
  allocatedTons: '48250.000',
  loadedTons: '0.000',
  freeTons: '1750.000',
  remainingTons: '50000.000',
  disposedOutTons: '0.000',
  surplusTons: '50000.000',
  unresolvedSurplusTons: '1750.000',
  status: 'open',
  closedAt: null,
  hasOrders: true,
  rowVersion: 3,
  ...extra,
});
const VESSELS = [
  vessel(11, 'Eagle 1'),
  vessel(12, 'Ocean Pride', {
    arrivalDate: null,
    voyageNo: null,
    etaDate: '2026-10-28',
    totalTons: '42000.000',
    allocatedTons: '12000.000',
    freeTons: '30000.000',
    remainingTons: '42000.000',
    surplusTons: '42000.000',
    unresolvedSurplusTons: '30000.000',
    hasOrders: false,
  }),
  vessel(13, 'Sea Star', {
    voyageNo: 1,
    arrivalDate: '2026-06-02',
    totalTons: '38500.000',
    allocatedTons: '38500.000',
    freeTons: '0.000',
    unresolvedSurplusTons: '0.000',
    status: 'closed',
    closedAt: '2026-09-30T15:00:00.000Z',
  }),
];

const dm = (n: number, number: string, extra: Partial<DeclarationDto> = {}): DeclarationDto => ({
  id: id(n),
  number,
  clientId: id(1),
  brand: 'Dosel',
  totalTons: '20000.000',
  declarationDate: '2026-09-20',
  deadlineStartDate: '2026-09-20',
  expiredAt: null,
  versionNo: 1,
  allocatedTons: '20000.000',
  loadedTons: '0.000',
  balanceTons: '20000.000',
  pendingAllocationTons: '0.000',
  allocations: [
    {
      id: id(n + 40),
      vesselId: id(11),
      allocatedTons: '20000.000',
      loadedTons: '0.000',
      balanceTons: '20000.000',
      rowVersion: 1,
    },
  ],
  rowVersion: 1,
  ...extra,
});
const DMS = [
  dm(21, '00431'),
  dm(22, '00433', {
    clientId: id(2),
    brand: 'Molinera',
    deadlineStartDate: '2026-10-03',
    declarationDate: '2026-10-03',
  }),
  dm(23, '00438', {
    totalTons: null,
    allocatedTons: '0.000',
    balanceTons: null,
    pendingAllocationTons: null,
    allocations: [],
  }),
  dm(24, '00402', {
    clientId: id(2),
    declarationDate: '2026-09-01',
    deadlineStartDate: '2026-09-01',
    expiredAt: '2026-10-01T04:00:00.000Z',
    allocatedTons: '0.000',
    pendingAllocationTons: '20000.000',
    allocations: [],
  }),
];

const base = {
  api: () => {
    throw new Error('Sin servidor en las historias');
  },
  canEdit: true,
  offlineReason: undefined,
  notice: null,
  setNotice: noop,
  busy: null,
  done: asyncNoop,
  act: asyncNoop,
};
const NONE: ReadonlySet<string> = new Set();
const vesselName = (v: string | null) => VESSELS.find((x) => x.id === v)?.name ?? '';

// ---------- P-07 y P-08 ----------

const vessels = (selected: VesselDto | null, extra: Partial<VesselsModel> = {}): VesselsModel => ({
  ...base,
  vessels: VESSELS,
  changed: NONE,
  selected,
  vesselName,
  clientName: (c) => CLIENTS[c] ?? '',
  declarationsOf: (v) =>
    DMS.flatMap((d) =>
      d.allocations.filter((a) => a.vesselId === v.id).map((a) => ({ declaration: d, allocation: a })),
    ),
  mode: 'detail',
  tab: 'summary',
  setTab: noop,
  surplus: null,
  history: null,
  open: noop,
  close: noop,
  cancelMode: noop,
  code: 'EAGLE1',
  openNew: noop,
  createFields: {
    name: field('name', 'Eagle 1'),
    manifest: field('manifest', '0080/2026'),
    bl: field('bl', 'BL-2026-0412'),
    port: field('port', 'Mariel, terminal 2'),
    internalBuyer: field('internalBuyer', 'IMPOCARIBE S.A.'),
    etaDate: field('etaDate'),
    arrivalDate: field('arrivalDate'),
    totalTons: field('totalTons', '50000'),
  },
  createSummary: [],
  createError: null,
  creating: false,
  submitCreate: asyncNoop,
  createDirty: false,
  openEdit: noop,
  editFields: {
    name: field('name', 'Eagle 1'),
    manifest: field('manifest', '0080/2026'),
    bl: field('bl', 'BL-2026-0412'),
    port: field('port', 'Mariel, terminal 2'),
    internalBuyer: field('internalBuyer', 'IMPOCARIBE S.A.'),
    etaDate: field('etaDate'),
    totalTons: field('totalTons', '50000,000'),
    reason: field('reason'),
  },
  editSummary: [],
  editError: null,
  editing: false,
  submitEdit: asyncNoop,
  editDirty: false,
  arrivalLocked: selected?.hasOrders
    ? 'El buque ya tiene órdenes emitidas: su fecha de arribo real fija el año y el viaje de números ya impresos.'
    : undefined,
  openArrival: noop,
  arrivalFields: { arrivalDate: field('arrivalDate', '2026-08-30'), reason: field('reason') },
  arrivalSummary: [],
  arrivalError: null,
  savingArrival: false,
  submitArrival: asyncNoop,
  arrivalDirty: false,
  closedReason: undefined,
  openAssign: noop,
  declarationOptions: [{ value: id(23), label: '00440 · Nuevos Tiempos S.R.L. · pendiente 10 000,000 t' }],
  assignFields: { declarationId: field('declarationId'), tons: field('tons') },
  assignSummary: [],
  assignError: null,
  assigning: false,
  submitAssign: asyncNoop,
  assignDirty: false,
  exceeds: null,
  exceedsNo: noop,
  kindOptions: [
    { value: 'allocate', label: 'Asignar a una DM' },
    { value: 'transfer', label: 'Transferir a otro buque' },
    { value: 'loss', label: 'Merma o pérdida' },
  ],
  disposeKind: 'transfer',
  targetVesselOptions: [{ value: id(12), label: 'Ocean Pride' }],
  openDispose: noop,
  disposeFields: {
    kind: field('kind', 'transfer'),
    tons: field('tons', '1750'),
    targetVesselId: field('targetVesselId', id(12)),
    targetDeclarationId: field('targetDeclarationId'),
    reason: field('reason', 'Se completa la carga de Ocean Pride'),
  },
  disposeSummary: [],
  disposeError: null,
  disposing: false,
  submitDispose: asyncNoop,
  disposeDirty: false,
  closeBlocked:
    selected && selected.unresolvedSurplusTons !== '0.000'
      ? `Faltan ${selected.unresolvedSurplusTons.replace('.', ',')} t de sobrante por darle destino.`
      : undefined,
  confirmClose: false,
  askClose: noop,
  cancelClose: noop,
  closeVessel: noop,
  ...extra,
});
const VESSEL_VIEWS = { phone: VesselsPhone, tablet: VesselsTablet, desktop: VesselsDesktop };

export const Buques: StoryObj = { render: inDevice(VESSEL_VIEWS, vessels(null)) };
export const FichaDeBuque: StoryObj = { render: inDevice(VESSEL_VIEWS, vessels(VESSELS[0]!)) };
export const SobranteYDestinos: StoryObj = {
  render: inDevice(
    VESSEL_VIEWS,
    vessels(VESSELS[1]!, {
      tab: 'surplus',
      surplus: {
        surplusTons: '42000.000',
        unresolvedTons: '30000.000',
        dispositions: [
          {
            id: id(51),
            kind: 'allocate',
            tons: '600.000',
            incoming: false,
            otherVesselId: null,
            targetDeclarationId: id(21),
            reason: 'Completa el pedido de la DM 00431',
            createdBy: 'Mario Delgado',
            createdAt: '2026-10-12T15:00:00.000Z',
          },
        ],
      },
    }),
  ),
};
export const DestinoDelSobrante: StoryObj = {
  render: inDevice(VESSEL_VIEWS, vessels(VESSELS[0]!, { mode: 'dispose' })),
};

// ---------- P-09 a P-11 ----------

const declarations = (selected: DeclarationDto | null, extra: Partial<DeclarationsModel> = {}): DeclarationsModel => {
  const status = (d: DeclarationDto) => statusOf(d, NOW);
  return {
    ...base,
    declarations: DMS,
    shown: DMS,
    counts: { all: 4, active: 2, pending_allocation: 0, pending_total: 1, expired: 1, closed: 0 },
    changed: NONE,
    status,
    dayOf: (d) => Math.round((NOW.getTime() - Date.parse(d.deadlineStartDate)) / 86_400_000) + 1,
    clientName: (c) => CLIENTS[c] ?? '',
    vesselOf: (v) => VESSELS.find((x) => x.id === v),
    vessels: VESSELS,
    filter: 'all',
    setFilter: noop,
    vesselFilter: '',
    setVesselFilter: noop,
    clientFilter: '',
    setClientFilter: noop,
    search: '',
    setSearch: noop,
    vesselOptions: [{ value: id(11), label: 'Eagle 1 · V2 · libre 1 750,000 t' }],
    clientOptions: Object.entries(CLIENTS).map(([value, label]) => ({ value, label })),
    vesselFilterOptions: VESSELS.map((v) => ({ value: v.id, label: v.name })),
    clientFilterOptions: Object.entries(CLIENTS).map(([value, label]) => ({ value, label })),
    selected,
    selectedStatus: selected ? status(selected) : null,
    mode: 'detail',
    panelOpen: selected !== null,
    open: noop,
    close: noop,
    tab: 'summary',
    setTab: noop,
    history: null,
    deadline: selected
      ? {
          day: Math.round((NOW.getTime() - Date.parse(selected.deadlineStartDate)) / 86_400_000) + 1,
          warning: selected.number === '00431',
          expired: selected.expiredAt !== null,
        }
      : null,
    lastDay: selected ? '2026-10-19' : null,
    stage: selected ? (selected.expiredAt ? 'expired' : selected.allocations.length ? 1 : 0) : 0,
    legalNotice: DEFAULT_LEGAL_NOTICE,
    today: '14/10/2026',
    openNew: noop,
    createFields: {
      number: field('number', '00450'),
      clientId: field('clientId', id(1)),
      brand: field('brand', 'Dosel'),
      totalTons: field('totalTons', '80000'),
      vesselId: field('vesselId', id(11)),
      allocationTons: field('allocationTons', '80000'),
    },
    numberReason: undefined,
    createSummary: [],
    createError: null,
    creating: false,
    submitCreate: asyncNoop,
    createDirty: false,
    nextCreateStep: async () => true,
    openEdit: noop,
    editFields: {
      brand: field('brand', 'Dosel'),
      totalTons: field('totalTons', '15000', {
        error: 'El total no puede ser menor que lo ya cargado (15 789,500 t).',
      }),
      reason: field('reason'),
    },
    editSummary: [],
    editError: null,
    editing: false,
    submitEdit: asyncNoop,
    editDirty: false,
    assignBlocked:
      selected?.totalTons === null ? 'Registre el total de la DM antes de asignarla a un buque.' : undefined,
    openAssign: noop,
    assignFields: { vesselId: field('vesselId'), tons: field('tons') },
    assignSummary: [],
    assignError: null,
    assigning: false,
    submitAssign: asyncNoop,
    assignDirty: false,
    cancelMode: noop,
    exceeds: null,
    exceedsNo: noop,
    reactivating: false,
    askReactivate: noop,
    cancelReactivate: noop,
    reactivate: noop,
    ...extra,
  };
};
const DM_VIEWS = { phone: DeclarationsPhone, tablet: DeclarationsTablet, desktop: DeclarationsDesktop };

export const ListaDeDm: StoryObj = { render: inDevice(DM_VIEWS, declarations(null)) };
export const FichaDeDm: StoryObj = { render: inDevice(DM_VIEWS, declarations(DMS[0]!)) };
export const DmVencida: StoryObj = { render: inDevice(DM_VIEWS, declarations(DMS[3]!)) };
export const NuevaDm: StoryObj = { render: inDevice(DM_VIEWS, declarations(null, { mode: 'new', panelOpen: true })) };
export const SuperaLoLibre: StoryObj = {
  render: inDevice(
    DM_VIEWS,
    declarations(null, {
      mode: 'new',
      panelOpen: true,
      exceeds: {
        title: 'La DM 00450 supera la cantidad restante del buque EAGLE1 en 78 250,000 t',
        free: '1750.000',
        confirm: asyncNoop,
      },
    }),
  ),
};
export const EditarDm: StoryObj = { render: inDevice(DM_VIEWS, declarations(DMS[0]!, { mode: 'edit' })) };
