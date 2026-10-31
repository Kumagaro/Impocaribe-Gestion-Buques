import type { Meta, StoryObj } from '@storybook/react-vite';
import type { DeviceClass } from '../../ui/device';
import { asyncNoop, field, inDevice, noop } from '../story-helpers';
import { CorrectOrderView } from './CorrectOrder.screen';
import { DraftsDesktop } from './Drafts.desktop';
import { DraftsPhone } from './Drafts.phone';
import { DraftsTablet } from './Drafts.tablet';
import { NewOrderDesktop } from './NewOrder.desktop';
import type { NewOrderProps } from './NewOrder.parts';
import { NewOrderPhone } from './NewOrder.phone';
import { NewOrderTablet } from './NewOrder.tablet';
import { OrderDesktop } from './Order.desktop';
import { OrderPhone } from './Order.phone';
import { OrderTablet } from './Order.tablet';
import { CARRIER, CLIENT, DM, DRIVER, id, ORDER, TRAILERS, TRUCK, VESSEL, version } from './orders.fixtures';
import type { DraftsModel } from './useDrafts';
import type { OrderModel } from './useOrder';
import type { OrderFormModel } from './useOrderForm';

// T086 a T089 · P-13 a P-16 (ui-spec y maqueta T085): cada estado con un modelo fijo, sin servidor. Datos ficticios.
const meta: Meta = { title: 'Pantallas/Órdenes' };
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

const VALUES = {
  declarationId: DM.id,
  allocationId: id(11),
  recipientId: CLIENT.recipients[0]!.id,
  carrierId: CARRIER.id,
  truckId: TRUCK.id,
  trailerIds: [id(4), id(5)],
  driverId: DRIVER.id,
  tons: '17,280',
  waybillNo: '22352',
  loadingDate: '2026-10-14',
  lotNo: '',
  routeSheetNo: '',
  container: '',
  reason: '',
};

const formModel = (extra: Partial<OrderFormModel> = {}): OrderFormModel =>
  ({
    ...base,
    form: null,
    fixing: null,
    today: '2026-10-14',
    declaration: DM,
    vessel: VESSEL,
    client: CLIENT,
    recipient: CLIENT.recipients[0],
    truck: TRUCK,
    driver: DRIVER,
    carrierName: () => CARRIER.name,
    declarationOptions: [{ value: DM.id, label: '00431 · Nuevos Tiempos S.R.L. · Dosel' }],
    allocationOptions: [{ value: id(11), label: 'Eagle 1 · saldo 82,720 t' }],
    recipientOptions: [{ value: CLIENT.recipients[0]!.id, label: 'Almacén Central' }],
    carrierOptions: [{ value: CARRIER.id, label: CARRIER.name }],
    truckOptions: [{ value: TRUCK.id, label: TRUCK.plate }],
    driverOptions: [{ value: DRIVER.id, label: DRIVER.fullName }],
    trailerChoices: TRAILERS,
    trailerIds: [id(4), id(5)],
    toggleTrailer: noop,
    trailersError: undefined,
    fields: Object.fromEntries(Object.entries(VALUES).map(([k, v]) => [k, field(k, Array.isArray(v) ? '' : v)])),
    panel: { balance: '82,720 t', thisOrder: '17,280 t', after: '65,440 t', capacity: '50,000 t', overdraft: false },
    checks: [
      { tone: 'ok', text: 'Cabe en el saldo de la asignación' },
      { tone: 'ok', text: 'Dentro de la capacidad de los remolques' },
      { tone: 'ok', text: 'Chofer, camión y remolques de Transportes Escambray' },
    ],
    blocking: undefined,
    summary: [],
    formError: null,
    saving: false,
    submit: asyncNoop,
    values: VALUES,
    issued: null,
    resetIssued: noop,
    override: null,
    cancelOverride: noop,
    confirmOverride: noop,
    download: noop,
    ...extra,
  }) as unknown as OrderFormModel;

const newOrder = (model: OrderFormModel): NewOrderProps => ({
  model,
  share: noop,
  savedAt: '2026-10-14T16:00:00.000Z',
  onCancel: noop,
  onAnother: noop,
  onOpen: noop,
});
const NEW_VIEWS = {
  phone: ({ model }: { model: NewOrderProps }) => <NewOrderPhone p={model} />,
  tablet: ({ model }: { model: NewOrderProps }) => <NewOrderTablet p={model} />,
  desktop: ({ model }: { model: NewOrderProps }) => <NewOrderDesktop p={model} />,
};

export const NuevaOrden: StoryObj = { render: inDevice(NEW_VIEWS, newOrder(formModel())) };
export const Sobregiro: StoryObj = {
  render: inDevice(
    NEW_VIEWS,
    newOrder(
      formModel({
        panel: { balance: '82,720 t', thisOrder: '83,000 t', after: '-0,280 t', capacity: '50,000 t', overdraft: true },
        checks: [
          { tone: 'bad', text: 'Esta orden pasa el saldo por 0,280 t. Quedan 82,720 t en la asignación.' },
          { tone: 'warn', text: 'La fecha de carga no es hoy.' },
        ],
        blocking: {
          code: 'OVERDRAFT_ALLOCATION',
          message: 'Esta orden pasa el saldo por 0,280 t. Quedan 82,720 t en la asignación.',
        },
      }),
    ),
  ),
};
export const ExcepcionDeCapacidad: StoryObj = {
  render: inDevice(
    NEW_VIEWS,
    newOrder(
      formModel({
        override: {
          kind: 'capacity',
          title: 'La orden pasa la capacidad de los remolques (50,000 t) por 0,500 t.',
          rule: 'Toneladas 50,500 t · capacidad de los remolques 50,000 t. Se puede emitir con una decisión de excepción: queda en la bitácora.',
        },
      }),
    ),
  ),
};
export const OrdenEmitida: StoryObj = { render: inDevice(NEW_VIEWS, newOrder(formModel({ issued: ORDER }))) };

const correctViews = (m: OrderFormModel) => {
  const view = (device: DeviceClass) => () => (
    <CorrectOrderView m={m} device={device} changes={['Toneladas: 17,280 t → 18,000 t']} onCancel={noop} />
  );
  return { phone: view('phone'), tablet: view('tablet'), desktop: view('desktop') };
};
export const Corregir: StoryObj = {
  render: inDevice(
    correctViews(
      formModel({
        fixing: ORDER,
        values: { ...VALUES, tons: '18,000' },
        fields: Object.fromEntries(
          Object.entries({ ...VALUES, tons: '18,000' }).map(([k, v]) => [k, field(k, Array.isArray(v) ? '' : v)]),
        ) as OrderFormModel['fields'],
      }),
    ) as never,
    null,
  ),
};

const orderModel = (extra: Partial<OrderModel> = {}): OrderModel => {
  const v2 = version(2, { tons: '18.000', reason: 'Peso corregido en la báscula del puerto' });
  const order = { ...ORDER, current: v2, versions: [version(1, { status: 'replaced' }), v2] };
  return {
    ...base,
    loading: false,
    order,
    declaration: DM,
    canChange: true,
    original: true,
    timeline: [
      { version: v2, current: true, changes: ['Toneladas: 17,280 t → 18,000 t'] },
      { version: version(1, { status: 'replaced' }), current: false, changes: [] },
    ],
    download: noop,
    correct: noop,
    voiding: false,
    askVoid: noop,
    cancelVoid: noop,
    voidText:
      'Se repondrán 18,000 t al saldo de la DM 00431. El PDF queda archivado con la marca ANULADA y la orden no admite más versiones.',
    void: noop,
    ...extra,
  };
};
const ORDER_VIEWS = { phone: OrderPhone, tablet: OrderTablet, desktop: OrderDesktop };
export const Orden: StoryObj = { render: inDevice(ORDER_VIEWS, orderModel()) };
export const AnularOrden: StoryObj = { render: inDevice(ORDER_VIEWS, orderModel({ voiding: true })) };
export const OrdenAnulada: StoryObj = {
  render: inDevice(
    ORDER_VIEWS,
    orderModel({
      order: {
        ...ORDER,
        status: 'voided',
        current: version(2, { status: 'voided', reason: 'El camión no se presentó' }),
      },
      canChange: false,
      original: false,
    }),
  ),
};

const draftsModel: DraftsModel = {
  ...base,
  loading: false,
  mine: [
    {
      id: id(40),
      where: 'device',
      payload: { declarationId: DM.id, truckId: TRUCK.id, tons: '17,28' },
      updatedAt: '2026-10-14T16:30:00.000Z',
      ownerName: null,
      lockedByName: null,
      lockedById: null,
    },
  ],
  shared: [
    {
      id: id(41),
      where: 'shared',
      payload: { declarationId: DM.id },
      updatedAt: '2026-10-14T13:12:00.000Z',
      ownerName: 'Ilén Fernández Rojas',
      lockedByName: 'Ilén Fernández Rojas',
      lockedById: id(91),
    },
  ],
  title: () => '00431',
  detail: (r) => (r.payload.tons ? `W011612 · ${r.payload.tons} t` : 'Sin datos todavía'),
  canRelease: (r) => !!r.lockedById,
  open: noop,
  share: noop,
  release: noop,
  confirm: null,
  askDiscard: noop,
  cancelDiscard: noop,
  discard: noop,
};
export const Borradores: StoryObj = {
  render: inDevice({ phone: DraftsPhone, tablet: DraftsTablet, desktop: DraftsDesktop }, draftsModel),
};
