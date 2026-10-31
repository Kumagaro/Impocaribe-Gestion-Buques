import { auditActionLabel, parseTons } from '@impocaribe/shared';
import type { AuditEntryDto, DeclarationDto } from '@impocaribe/shared/validation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { alertsStoryModel } from '../alerts/alerts.story-model';
import { AuditDesktop } from '../audit/Audit.desktop';
import { AuditPhone } from '../audit/Audit.phone';
import { AuditTablet } from '../audit/Audit.tablet';
import { changesOf, detailOf, type AuditModel } from '../audit/useAudit';
import { OrderListDesktop } from '../orders/OrderList.desktop';
import { OrderListPhone } from '../orders/OrderList.phone';
import { OrderListTablet } from '../orders/OrderList.tablet';
import { DM, id, ORDER, SNAPSHOT, version } from '../orders/orders.fixtures';
import { rowOf, totalsOf, type OrderListModel } from '../orders/useOrderList';
import { SearchDesktop } from '../search/Search.desktop';
import { SearchPhone } from '../search/Search.phone';
import { SearchTablet } from '../search/Search.tablet';
import type { Ficha, SearchModel } from '../search/useSearch';
import { asyncNoop, inDevice, noop } from '../story-helpers';
import { DashboardDesktop } from './Dashboard.desktop';
import { DashboardPhone } from './Dashboard.phone';
import { DashboardTablet } from './Dashboard.tablet';
import type { DashboardModel, DashboardRow } from './useDashboard';

// T100 a T104 · P-06, P-12, P-25 y P-32 (ui-spec y maqueta T099): cada estado con un modelo fijo, sin servidor.
// Datos ficticios.
const meta: Meta = { title: 'Pantallas/Tablero y consultas' };
export default meta;

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
const t = parseTons;

// ---------- P-06 ----------

const dmRow = (extra: Partial<DashboardRow>): DashboardRow => ({
  id: id(10),
  number: '00431',
  clientBrand: 'Nuevos Tiempos S.R.L. · Dosel',
  total: t('900'),
  loaded: t('306.95'),
  pending: t('593.05'),
  progress: 34.1,
  orders: 18,
  stage: 'extracting',
  stageText: 'En extracción',
  tone: 'info',
  day: 12,
  ...extra,
});
const ROWS: DashboardRow[] = [
  dmRow({}),
  dmRow({
    id: id(12),
    number: '00437',
    clientBrand: 'Particular A · Delicia DYD',
    total: null,
    loaded: t('0'),
    pending: null,
    progress: 0,
    orders: 0,
    stage: 'pending',
    stageText: 'Pendiente',
    tone: 'mute',
    day: 4,
  }),
  dmRow({
    id: id(13),
    number: '00439',
    clientBrand: 'Particular C · Yin DYD',
    total: t('410'),
    loaded: t('174.22'),
    pending: t('235.78'),
    progress: 42.5,
    orders: 9,
    stageText: 'En extracción · día 26',
    tone: 'warn',
    day: 26,
  }),
  dmRow({
    id: id(14),
    number: '00425',
    total: t('219.29'),
    loaded: t('219.29'),
    pending: t('0'),
    progress: 100,
    orders: 11,
    stage: 'delivered',
    stageText: 'Entregada',
    tone: 'ok',
  }),
];
const dashboard = (extra: Partial<DashboardModel> = {}): DashboardModel => ({
  loading: false,
  vesselId: '',
  setVesselId: noop,
  vesselOptions: [
    { value: '', label: 'Todos los buques' },
    { value: id(9), label: 'Eagle 1' },
  ],
  stats: {
    contracted: '1 529,290 t',
    extracted: '700,460 t',
    pending: '828,830 t',
    contractedTons: 1529.29,
    extractedTons: 700.46,
    pendingTons: 828.83,
    dms: 4,
    official: 38,
    voided: 2,
    drafts: 3,
    attention: 2,
  },
  rows: ROWS,
  changed: new Set([id(10)]),
  alerts: alertsStoryModel(),
  selected: ROWS[0]!,
  select: noop,
  openDeclaration: noop,
  newOrder: noop,
  ...extra,
});
const DASHBOARD_VIEWS = { phone: DashboardPhone, tablet: DashboardTablet, desktop: DashboardDesktop };
export const Tablero: StoryObj = { render: inDevice(DASHBOARD_VIEWS, dashboard()) };
export const TableroSoloLectura: StoryObj = {
  render: inDevice(
    DASHBOARD_VIEWS,
    dashboard({ newOrder: null, stats: { ...dashboard().stats, drafts: null }, changed: NONE }),
  ),
};

// ---------- P-32 ----------

const order = (
  n: number,
  number: string,
  extra: Parameters<typeof version>[1],
  status: 'official' | 'voided' = 'official',
) => {
  const v = version(1, { ...extra, snapshot: { ...SNAPSHOT, number } });
  return { ...ORDER, id: id(n), number, status, current: v, versions: [v] };
};
const ORDER_ROWS = [
  order(30, 'EAGLE1-2026-V2-0042', {}),
  order(31, 'EAGLE1-2026-V2-0041', { tons: '18.000', versionNo: 2 }),
  order(32, 'SOL2-2026-V3-0017', { tons: '30.000' }, 'voided'),
].map(rowOf);
const orderList = (extra: Partial<OrderListModel> = {}): OrderListModel => ({
  ...base,
  loading: false,
  today: '2026-10-14',
  filters: {
    period: 'today',
    dateKind: 'loading',
    from: '',
    to: '',
    status: '',
    vesselId: '',
    declarationId: '',
    clientId: '',
    carrierId: '',
    driverId: '',
  },
  set: noop,
  rangeError: undefined,
  rows: ORDER_ROWS,
  totals: totalsOf(ORDER_ROWS),
  changed: new Set([id(30)]),
  options: {
    status: [{ value: '', label: 'Todas' }],
    vessel: [{ value: '', label: 'Todos' }],
    declaration: [{ value: '', label: 'Todas' }],
    client: [{ value: '', label: 'Todos' }],
    carrier: [{ value: '', label: 'Todos' }],
    driver: [{ value: '', label: 'Todos' }],
  },
  selected: ORDER_ROWS[0]!,
  select: noop,
  open: noop,
  download: noop,
  ...extra,
});
const ORDER_VIEWS = { phone: OrderListPhone, tablet: OrderListTablet, desktop: OrderListDesktop };
export const Ordenes: StoryObj = { render: inDevice(ORDER_VIEWS, orderList()) };
export const OrdenesSinResultados: StoryObj = {
  render: inDevice(ORDER_VIEWS, orderList({ rows: [], totals: totalsOf([]), selected: null })),
};

// ---------- P-12 ----------

const ficha = (d: DeclarationDto, archived = false): Ficha => ({
  declaration: d,
  clientName: 'Nuevos Tiempos S.R.L.',
  stage: { stage: 'extracting', expired: false },
  stageText: 'En extracción',
  day: 12,
  allocations: [{ vesselName: 'Eagle 1', allocated: '100.000', loaded: '17.280', balance: '82.720' }],
  orders: [ORDER],
  archived,
});
const search = (extra: Partial<SearchModel> = {}): SearchModel => ({
  ...base,
  loading: false,
  q: '42',
  setQ: noop,
  declarations: [ficha({ ...DM, number: '00442' })],
  orders: [order(30, 'EAGLE1-2026-V2-0042', {}), order(33, 'SOL2-2026-V3-0042', { tons: '30.000' }, 'voided')],
  clients: [],
  archive: null,
  searchArchive: noop,
  ficha: null,
  open: noop,
  back: noop,
  openOrder: noop,
  showClient: noop,
  newOrder: noop,
  downloadTracking: noop,
  downloadOrder: noop,
  ...extra,
});
const SEARCH_VIEWS = { phone: SearchPhone, tablet: SearchTablet, desktop: SearchDesktop };
export const Buscar: StoryObj = { render: inDevice(SEARCH_VIEWS, search()) };
export const FichaDeLaDM: StoryObj = { render: inDevice(SEARCH_VIEWS, search({ q: 'Dosel', ficha: ficha(DM) })) };
export const BuscarEnElArchivo: StoryObj = {
  render: inDevice(
    SEARCH_VIEWS,
    search({
      q: '102',
      declarations: [],
      orders: [],
      archive: {
        declarations: [ficha({ ...DM, id: id(60), number: '00102', deadlineStartDate: '2025-05-02' }, true)],
        orders: [order(61, 'EAGLE1-2025-V1-0102', { loadingDate: '2025-05-20' })],
      },
    }),
  ),
};

// ---------- P-25 ----------

const entry = (n: number, extra: Partial<AuditEntryDto>): AuditEntryDto => ({
  id: n,
  at: '2026-10-14T16:31:00.000Z',
  userName: 'Mario Delgado',
  deviceName: 'Tel. patio',
  action: 'order.correct',
  entityType: 'order',
  entityId: id(30),
  entityLabel: 'EAGLE1-2026-V1-0042',
  before: { versionNo: 1, tons: '17.280' },
  after: { versionNo: 2, tons: '18.000' },
  reason: 'Peso corregido en la báscula',
  ok: true,
  ...extra,
});
const ENTRIES = [
  entry(4, {}),
  entry(3, {
    at: '2026-10-14T16:05:00.000Z',
    userName: 'Ilén Fernández',
    deviceName: 'PC oficina',
    action: 'order.download',
    before: null,
    after: { kind: 'copy', versionNo: 2 },
    reason: null,
  }),
  entry(2, {
    at: '2026-10-14T13:40:00.000Z',
    action: 'order.issue',
    entityLabel: null,
    entityId: null,
    before: null,
    after: { code: 'OVERDRAFT_ALLOCATION', message: 'Esta orden pasa el saldo por 0,280 t.' },
    reason: null,
    ok: false,
  }),
  entry(1, {
    at: '2026-10-14T13:38:00.000Z',
    action: 'order.issue',
    before: null,
    after: { number: 'EAGLE1-2026-V1-0042', tons: '17.280' },
    reason: null,
  }),
];
const audit = (extra: Partial<AuditModel> = {}): AuditModel => ({
  online: true,
  filters: { userId: '', from: '2026-10-01', to: '2026-10-14', group: '', ref: '0042' },
  typed: '0042',
  set: noop,
  clear: noop,
  errors: {},
  userOptions: [{ value: '', label: 'Todos' }],
  groupOptions: [{ value: '', label: 'Todas' }],
  loading: false,
  failed: false,
  retry: noop,
  entries: ENTRIES,
  more: true,
  loadingMore: false,
  loadMore: noop,
  label: (e) => auditActionLabel(e.action),
  detail: detailOf,
  changes: (e) => changesOf(e.before, e.after),
  open: 4,
  toggle: noop,
  ...extra,
});
const AUDIT_VIEWS = { phone: AuditPhone, tablet: AuditTablet, desktop: AuditDesktop };
export const Bitacora: StoryObj = { render: inDevice(AUDIT_VIEWS, audit()) };
export const BitacoraSinConexion: StoryObj = { render: inDevice(AUDIT_VIEWS, audit({ online: false })) };
