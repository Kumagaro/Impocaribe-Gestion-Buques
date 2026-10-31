import type { UserListItem } from '@impocaribe/shared/validation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { asyncNoop, field, inDevice, noop } from '../story-helpers';
import { UsersDesktop } from './Users.desktop';
import { UsersPhone } from './Users.phone';
import { UsersTablet } from './Users.tablet';
import { LAST_APODERADA_REASON, ROLE_CHANGE_WARNING, type UsersModel, type UsersPanel } from './useUsers';

// T040 · P-21 Usuarios (ui-spec y maqueta T037): cada estado con un modelo fijo, sin servidor.
const meta: Meta = { title: 'Pantallas/Usuarios' };
export default meta;

const user = (over: Partial<UserListItem>): UserListItem => ({
  id: '0199f0a1-0000-7000-8000-000000000001',
  username: 'ilen.fernandez',
  fullName: 'Ilén Fernández Rojas',
  nationalId: '84011905548',
  phone: '52345678',
  role: 'apoderada',
  active: true,
  mustChangePassword: false,
  rowVersion: 3,
  lastAccessAt: '2026-10-14T12:12:00.000Z',
  ...over,
});
const USERS: UserListItem[] = [
  user({}),
  user({
    id: '0199f0a1-0000-7000-8000-000000000002',
    username: 'mario.delgado',
    fullName: 'Mario Delgado Pérez',
    role: 'operador',
    lastAccessAt: '2026-10-14T11:40:00.000Z',
  }),
  user({
    id: '0199f0a1-0000-7000-8000-000000000003',
    username: 'yanet.ruiz',
    fullName: 'Yanet Ruiz Castro',
    role: 'operador',
    lastAccessAt: '2026-10-13T22:05:00.000Z',
  }),
  user({
    id: '0199f0a1-0000-7000-8000-000000000004',
    username: 'oscar.leyva',
    fullName: 'Oscar Leyva Martín',
    role: 'lectura',
    active: false,
    lastAccessAt: '2026-10-02T14:00:00.000Z',
  }),
];
const MARIO = USERS[1]!;
const CODES = ['K7QM-3XTP', 'R2HW-9CND', 'F4ZB-7MRK', 'T8JX-2QPV', 'W3NC-6HDF', 'P9KR-4TZM', 'H6VQ-8BXN', 'M2DT-5WJC'];

const users = (panel: UsersPanel, extra: Partial<UsersModel> = {}): UsersModel => ({
  list: { status: 'ready', users: USERS },
  reload: noop,
  changed: new Set(),
  offlineReason: undefined,
  now: new Date('2026-10-14T16:40:00.000Z'),
  notice: null,
  busy: null,
  panel,
  isLastApoderada: (u) => u.role === 'apoderada' && u.active,
  close: noop,
  openNew: noop,
  newFields: {
    fullName: field('fullName'),
    username: field('username'),
    nationalId: field('nationalId'),
    phone: field('phone'),
    role: field('role', 'operador'),
    password: field('password'),
    confirm: field('confirm'),
  },
  newSummary: [],
  newError: null,
  creating: false,
  submitNew: asyncNoop,
  copied: false,
  setCopied: noop,
  openEdit: noop,
  editFields: {
    fullName: field('fullName', MARIO.fullName),
    username: field('username', MARIO.username),
    nationalId: field('nationalId', MARIO.nationalId),
    phone: field('phone', MARIO.phone),
    role: field('role', 'lectura', { warning: ROLE_CHANGE_WARNING }),
  },
  editSummary: [],
  editError: null,
  saving: false,
  submitEdit: asyncNoop,
  askDeactivate: noop,
  deactivate: noop,
  activate: noop,
  openReset: noop,
  resetFields: { password: field('password'), confirm: field('confirm') },
  resetError: null,
  resetting: false,
  submitReset: asyncNoop,
  ...extra,
});
const VIEWS = { phone: UsersPhone, tablet: UsersTablet, desktop: UsersDesktop };

export const Lista: StoryObj = { name: 'Lista', render: inDevice(VIEWS, users(null)) };
export const Edicion: StoryObj = {
  name: 'Edición con cambio de rol',
  render: inDevice(VIEWS, users({ kind: 'edit', user: MARIO })),
};
export const UltimaApoderada: StoryObj = {
  name: 'Última Apoderada protegida',
  render: inDevice(
    VIEWS,
    users(
      { kind: 'edit', user: USERS[0]! },
      {
        editFields: {
          fullName: field('fullName', 'Ilén Fernández Rojas'),
          username: field('username', 'ilen.fernandez'),
          nationalId: field('nationalId', '84011905548'),
          phone: field('phone', '52345678'),
          role: field('role', 'apoderada', { warning: undefined }),
        },
      },
    ),
  ),
  parameters: { docs: { description: { story: LAST_APODERADA_REASON } } },
};
export const Alta: StoryObj = { name: 'Alta', render: inDevice(VIEWS, users({ kind: 'new' })) };
export const Codigos: StoryObj = {
  name: 'Códigos del nuevo usuario',
  render: inDevice(VIEWS, users({ kind: 'codes', name: 'Yanet Ruiz Castro', codes: CODES })),
};
