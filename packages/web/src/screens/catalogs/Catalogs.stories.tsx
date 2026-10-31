import type { CarrierDto, ClientDto, DriverDto, TrailerDto, TruckDto } from '@impocaribe/shared/validation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { asyncNoop, field, inDevice, noop } from '../story-helpers';
import { CarriersDesktop } from './Carriers.desktop';
import { CarriersPhone } from './Carriers.phone';
import { CarriersTablet } from './Carriers.tablet';
import { ClientsDesktop } from './Clients.desktop';
import { ClientsPhone } from './Clients.phone';
import { ClientsTablet } from './Clients.tablet';
import { FleetDesktop } from './Fleet.desktop';
import { FleetPhone } from './Fleet.phone';
import { FleetTablet } from './Fleet.tablet';
import { capacityOf, type FleetModel, type FleetPanel } from './useFleet';
import type { CarriersModel, CarriersPanel } from './useCarriers';
import type { ClientsModel } from './useClients';

// T058 y T059 · P-18 a P-20 Catálogos (ui-spec y maqueta T057): cada estado con un modelo fijo, sin servidor. Los
// nombres, chapas y carnés son ficticios.
const meta: Meta = { title: 'Pantallas/Catálogos' };
export default meta;

const id = (n: number) => `0199f0a1-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`;
const CARRIERS: CarrierDto[] = [
  { id: id(1), name: 'Transportes Escambray', active: true, rowVersion: 3 },
  { id: id(2), name: 'Transportes Habana', active: true, rowVersion: 1 },
  { id: id(3), name: 'Cooperativa Arimao', active: false, rowVersion: 2 },
];
const TRAILERS: TrailerDto[] = [
  { id: id(11), plate: 'P011111', capacityTons: '30.000', carrierId: id(1), active: true, rowVersion: 1 },
  { id: id(12), plate: 'P022222', capacityTons: '32.500', carrierId: id(1), active: true, rowVersion: 1 },
  { id: id(13), plate: 'P033333', capacityTons: '28.000', carrierId: id(2), active: true, rowVersion: 1 },
];
const TRUCKS: TruckDto[] = [
  {
    id: id(21),
    plate: 'W011612',
    tractorPlate: null,
    baseLocation: 'LA HABANA',
    carrierId: id(1),
    trailerIds: [id(11), id(12)],
    active: true,
    rowVersion: 1,
  },
  {
    id: id(22),
    plate: 'W045210',
    tractorPlate: 'B123456',
    baseLocation: 'MATANZAS',
    carrierId: id(2),
    trailerIds: [id(13)],
    active: false,
    rowVersion: 2,
  },
];
const DRIVERS: DriverDto[] = [
  {
    id: id(31),
    fullName: 'Juan Carlos Miranda',
    nationalId: '84011905548',
    licenseNo: '12345678901',
    carrierId: id(1),
    active: true,
    rowVersion: 4,
  },
  {
    id: id(32),
    fullName: 'Yoandry Pérez Castillo',
    nationalId: '90051212345',
    licenseNo: '23456789012',
    carrierId: id(2),
    active: true,
    rowVersion: 1,
  },
];
const CLIENTS: ClientDto[] = [
  {
    id: id(41),
    name: 'Nuevos Tiempos S.R.L.',
    active: true,
    rowVersion: 2,
    recipients: [
      { id: id(51), name: 'Almacén Central', address: 'Calle 100 y Boyeros, La Habana', active: true },
      { id: id(52), name: 'Almacén Este', address: 'Guanabacoa, La Habana', active: false },
    ],
  },
  { id: id(42), name: 'Empresa Mayorista Pinar', active: true, rowVersion: 1, recipients: [] },
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

// ---------- P-20 Transportistas ----------

const carriers = (panel: CarriersPanel, extra: Partial<CarriersModel> = {}): CarriersModel => ({
  ...base,
  carriers: CARRIERS,
  changed: NONE,
  counts: (c) => ({
    trucks: TRUCKS.filter((t) => t.carrierId === c).length,
    trailers: TRAILERS.filter((t) => t.carrierId === c).length,
    drivers: DRIVERS.filter((d) => d.carrierId === c).length,
  }),
  panel,
  close: noop,
  openNew: noop,
  openEdit: noop,
  nameField: field('name', panel?.kind === 'edit' ? panel.carrier.name : ''),
  sameReason: undefined,
  formError: null,
  summary: [],
  saving: false,
  submit: asyncNoop,
  dirty: false,
  confirm: null,
  askDeactivate: noop,
  cancelDeactivate: noop,
  deactivate: noop,
  activate: noop,
  ...extra,
});
const CARRIER_VIEWS = { phone: CarriersPhone, tablet: CarriersTablet, desktop: CarriersDesktop };

export const Transportistas: StoryObj = { render: inDevice(CARRIER_VIEWS, carriers(null)) };
export const TransportistaEditar: StoryObj = {
  render: inDevice(CARRIER_VIEWS, carriers({ kind: 'edit', carrier: CARRIERS[0]! })),
};
export const TransportistaRepetido: StoryObj = {
  render: inDevice(
    CARRIER_VIEWS,
    carriers(
      { kind: 'new' },
      {
        nameField: field('name', 'TRANSPORTES ESCAMBRAY'),
        sameReason: 'Ya existe el transportista «Transportes Escambray»: es el mismo nombre escrito de otra forma.',
      },
    ),
  ),
};
export const TransportistaDesactivar: StoryObj = {
  render: inDevice(CARRIER_VIEWS, carriers({ kind: 'edit', carrier: CARRIERS[0]! }, { confirm: CARRIERS[0]! })),
};

// ---------- P-19 Clientes ----------

const recipient = (i: number, name: string, address: string, saved: boolean, active = true) => ({
  key: `r${i}`,
  saved,
  active,
  name: field(`recipients.${i}.name`, name),
  address: field(`recipients.${i}.address`, address),
});
const clients = (edit: boolean): ClientsModel => ({
  ...base,
  clients: CLIENTS,
  changed: NONE,
  panel: edit ? { kind: 'edit', client: CLIENTS[0]! } : null,
  close: noop,
  openNew: noop,
  openEdit: noop,
  nameField: field('name', edit ? CLIENTS[0]!.name : ''),
  sameReason: undefined,
  recipients: edit
    ? [
        recipient(0, 'Almacén Central', 'Calle 100 y Boyeros, La Habana', true),
        recipient(1, 'Almacén Este', 'Guanabacoa, La Habana', true, false),
      ]
    : [],
  recipientsError: undefined,
  addRecipient: noop,
  removeRecipient: noop,
  toggleRecipient: noop,
  formError: null,
  summary: [],
  saving: false,
  submit: asyncNoop,
  dirty: false,
  confirm: null,
  askDeactivate: noop,
  cancelDeactivate: noop,
  deactivate: noop,
  activate: noop,
});
const CLIENT_VIEWS = { phone: ClientsPhone, tablet: ClientsTablet, desktop: ClientsDesktop };

export const Clientes: StoryObj = { render: inDevice(CLIENT_VIEWS, clients(false)) };
export const ClienteEditar: StoryObj = { render: inDevice(CLIENT_VIEWS, clients(true)) };

// ---------- P-18 Choferes y camiones ----------

const fleet = (tab: FleetModel['tab'], panel: FleetPanel, extra: Partial<FleetModel> = {}): FleetModel => ({
  ...base,
  carriers: CARRIERS,
  trucks: TRUCKS,
  trailers: TRAILERS,
  drivers: DRIVERS,
  shown: { trucks: TRUCKS, trailers: TRAILERS, drivers: DRIVERS },
  changed: { trucks: NONE, trailers: NONE, drivers: NONE },
  carrierName: (c) => CARRIERS.find((x) => x.id === c)?.name ?? '',
  carrierOptions: CARRIERS.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name })),
  tab,
  setTab: noop,
  carrierFilter: '',
  setCarrierFilter: noop,
  search: '',
  setSearch: noop,
  panel,
  close: noop,
  openTruck: noop,
  truckFields: {
    carrierId: field('carrierId', id(1)),
    plate: field('plate', 'W078901'),
    tractorPlate: field('tractorPlate'),
    baseLocation: field('baseLocation', 'LA HABANA'),
  },
  truckTrailerChoices: TRAILERS.filter((t) => t.carrierId === id(1)),
  truckTrailers: [id(11), id(12)],
  truckTrailersError: undefined,
  truckCapacity: capacityOf([id(11), id(12)], TRAILERS),
  toggleTrailer: noop,
  truckSameReason: undefined,
  truckSummary: [],
  truckError: null,
  savingTruck: false,
  submitTruck: asyncNoop,
  truckDirty: false,
  truckStep: 1,
  nextTruckStep: asyncNoop,
  prevTruckStep: noop,
  openTrailer: noop,
  trailerFields: { carrierId: field('carrierId'), plate: field('plate'), capacityTons: field('capacityTons') },
  trailerSameReason: undefined,
  trailerSummary: [],
  trailerError: null,
  savingTrailer: false,
  submitTrailer: asyncNoop,
  trailerDirty: false,
  openDriver: noop,
  driverFields: {
    fullName: field('fullName', DRIVERS[0]!.fullName),
    nationalId: field('nationalId', DRIVERS[0]!.nationalId),
    licenseNo: field('licenseNo', DRIVERS[0]!.licenseNo),
    carrierId: field('carrierId', id(1)),
  },
  driverIdReason: undefined,
  driverLicenseReason: undefined,
  driverSummary: [],
  driverError: null,
  savingDriver: false,
  submitDriver: asyncNoop,
  driverDirty: false,
  moving: null,
  askMove: noop,
  cancelMove: noop,
  moveFields: { carrierId: field('carrierId', id(2)), reason: field('reason') },
  moveError: null,
  savingMove: false,
  submitMove: asyncNoop,
  toggle: noop,
  ...extra,
});
const FLEET_VIEWS = { phone: FleetPhone, tablet: FleetTablet, desktop: FleetDesktop };

export const Camiones: StoryObj = { render: inDevice(FLEET_VIEWS, fleet('trucks', null)) };
export const CamionNuevo: StoryObj = {
  render: inDevice(FLEET_VIEWS, fleet('trucks', { kind: 'truck', item: null })),
};
export const CamionChapaRepetida: StoryObj = {
  render: inDevice(
    FLEET_VIEWS,
    fleet(
      'trucks',
      { kind: 'truck', item: null },
      {
        truckFields: {
          carrierId: field('carrierId', id(1)),
          plate: field('plate', 'W011612'),
          tractorPlate: field('tractorPlate'),
          baseLocation: field('baseLocation'),
        },
        truckSameReason: 'Ya existe un camión con la chapa W011612.',
        truckStep: 0,
      },
    ),
  ),
};
export const Choferes: StoryObj = { render: inDevice(FLEET_VIEWS, fleet('drivers', null)) };
export const ChoferCambiarTransportista: StoryObj = {
  render: inDevice(FLEET_VIEWS, fleet('drivers', { kind: 'driver', item: DRIVERS[0]! }, { moving: DRIVERS[0]! })),
};
