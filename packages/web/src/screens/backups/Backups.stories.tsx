import type { BackupDto, LostOrderDto } from '@impocaribe/shared/validation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { asyncNoop, field, inDevice, noop } from '../story-helpers';
import { BackupsDesktop } from './Backups.desktop';
import { BackupsPhone } from './Backups.phone';
import { BackupsTablet } from './Backups.tablet';
import type { BackupsModel, RestoreFlow } from './useBackups';

// T112 · P-24 Respaldos y restauración (maqueta T111): cada estado con un modelo fijo, sin servidor. Datos ficticios.
const meta: Meta = { title: 'Pantallas/Respaldos' };
export default meta;

const VIEWS = { phone: BackupsPhone, tablet: BackupsTablet, desktop: BackupsDesktop };
const NOW = new Date('2026-10-24T18:30:00.000Z');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MB = 1_048_576;

const backup = (n: number, extra: Partial<BackupDto>): BackupDto => ({
  id: id(n),
  kind: 'hourly',
  status: 'ok',
  startedAt: '2026-10-24T18:00:00.000Z',
  finishedAt: '2026-10-24T18:00:20.000Z',
  available: true,
  sizeBytes: Math.round(48.2 * MB),
  sha256: 'a'.repeat(64),
  error: null,
  externalPath: null,
  externalCopiedAt: null,
  createdByName: null,
  ...extra,
});
const BACKUPS: BackupDto[] = [
  backup(1, {}),
  backup(2, { startedAt: '2026-10-24T17:00:00.000Z', sizeBytes: Math.round(48.1 * MB) }),
  backup(3, {
    kind: 'pre_restore',
    startedAt: '2026-10-24T14:14:00.000Z',
    sizeBytes: Math.round(48 * MB),
    createdByName: 'Ana Apoderada',
  }),
  backup(4, {
    kind: 'daily',
    startedAt: '2026-10-24T00:00:00.000Z',
    sizeBytes: Math.round(47.9 * MB),
    externalPath: 'E:\\Respaldos',
    externalCopiedAt: '2026-10-24T00:00:40.000Z',
  }),
  backup(5, {
    status: 'failed',
    startedAt: '2026-10-23T20:00:00.000Z',
    sizeBytes: null,
    error: 'pg_dump: sin espacio en disco',
  }),
  backup(6, { startedAt: '2026-10-21T15:00:00.000Z', available: false }),
];

const lost = (n: number, extra: Partial<LostOrderDto>): LostOrderDto => ({
  id: id(20 + n),
  restoreId: id(19),
  number: `EAGLE1-2026-V1-000${n}`,
  declarationNumber: '00431',
  clientName: 'Nuevos Tiempos S.R.L.',
  truckPlate: 'W011612',
  tons: '60.000',
  loadingDate: '2026-10-23',
  issuedAt: '2026-10-23T14:40:00.000Z',
  issuedByName: 'Mario Delgado',
  orderStatus: 'official',
  status: 'pending',
  lastError: null,
  discardReason: null,
  resolvedByName: null,
  resolvedAt: null,
  ...extra,
});
const LOST = [
  lost(2, {}),
  lost(3, {
    tons: '30.000',
    lastError: 'No alcanza el saldo: la orden EAGLE1-2026-V1-0003 lleva 30,000 t y quedan 25,000 t en la asignación.',
  }),
];

const model = (extra: Partial<BackupsModel> = {}): BackupsModel => ({
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
  connected: true,
  now: () => NOW,
  loading: false,
  failed: false,
  retry: noop,
  status: {
    defined: true,
    setAt: '2026-07-01T14:00:00.000Z',
    confirmedAt: '2026-10-23T14:00:00.000Z',
    due: false,
    postponesLeft: 3,
  },
  backups: BACKUPS,
  lastHourly: BACKUPS[0]!,
  lastDaily: BACKUPS[3]!,
  lostPending: [],
  numbering: null,
  manual: noop,
  passwordOpen: false,
  openPassword: noop,
  closePassword: noop,
  passwordFields: { current: field('current'), password: field('password'), confirm: field('confirm') },
  passwordSummary: [],
  passwordError: null,
  submitPassword: asyncNoop,
  passwordSaving: false,
  flow: null,
  startRestore: noop,
  setFlowPassword: noop,
  setFlowWord: noop,
  toConfirm: noop,
  back: noop,
  cancelRestore: noop,
  canRestore: false,
  signOut: noop,
  restore: asyncNoop,
  recover: noop,
  discarding: null,
  askDiscard: noop,
  cancelDiscard: noop,
  discard: noop,
  printed: {},
  setPrinted: noop,
  numberingErrors: {},
  confirmNumbering: noop,
  ...extra,
});

const flow = (extra: Partial<RestoreFlow>): RestoreFlow => ({
  backup: BACKUPS[3]!,
  step: 'password',
  password: '',
  word: '',
  error: null,
  result: null,
  ...extra,
});

export const Respaldos: StoryObj = { render: inDevice(VIEWS, model({ lostPending: LOST })) };

export const SinContrasena: StoryObj = {
  render: inDevice(
    VIEWS,
    model({
      status: { defined: false, setAt: null, confirmedAt: null, due: false, postponesLeft: 3 },
      backups: [],
      lastHourly: null,
      lastDaily: null,
      passwordFields: {
        current: field('current'),
        password: field('password', 'respaldo-impocaribe'),
        confirm: field('confirm', 'respaldo-impocaribe', {
          warning: 'Si la pierde, los respaldos no se podrán recuperar. Guárdela impresa',
        }),
      },
    }),
  ),
};

export const ConfirmarNumeracion: StoryObj = {
  render: inDevice(
    VIEWS,
    model({
      numbering: [
        { id: id(30), name: 'Eagle 1', code: 'EAGLE1', lastOrderSeq: 41 },
        { id: id(31), name: 'Sol 2', code: 'SOL2', lastOrderSeq: 16 },
      ],
      printed: { [id(30)]: '47', [id(31)]: '' },
      numberingErrors: { [id(31)]: 'Escriba el último número impreso.' },
    }),
  ),
};

export const RestaurarContrasena: StoryObj = {
  render: inDevice(VIEWS, model({ flow: flow({ password: 'respaldo de prueba' }) })),
};

export const RestaurarConfirmar: StoryObj = {
  render: inDevice(
    VIEWS,
    model({ flow: flow({ step: 'confirm', password: 'x', word: 'RESTAURAR' }), canRestore: true }),
  ),
};

export const RestaurarResultado: StoryObj = {
  render: inDevice(
    VIEWS,
    model({
      flow: flow({
        step: 'done',
        word: 'RESTAURAR',
        result: { restoreId: id(19), lostOrders: 2, confirmationRequired: false },
      }),
    }),
  ),
};

export const SinConexion: StoryObj = { render: inDevice(VIEWS, model({ connected: false })) };
