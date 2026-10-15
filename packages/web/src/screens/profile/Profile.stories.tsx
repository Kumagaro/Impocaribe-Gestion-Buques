import type { SessionDto } from '@impocaribe/shared/validation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { asyncNoop, field, inDevice, noop } from '../story-helpers';
import { ProfileDesktop } from './Profile.desktop';
import { ProfilePhone } from './Profile.phone';
import { ProfileTablet } from './Profile.tablet';
import type { ProfileModel, ProfileSection } from './useProfile';

// T039 · P-05 Perfil (ui-spec y maqueta T037): cada estado con un modelo fijo, sin servidor. En teléfono, sin sección
// elegida se ve la lista; en tablet y escritorio, las secciones a la izquierda.
const meta: Meta = { title: 'Pantallas/Perfil' };
export default meta;

const SESSIONS: SessionDto[] = [
  {
    id: '0199f0a1-0000-7000-8000-000000000001',
    deviceLabel: 'PC OFICINA',
    platform: 'windows',
    createdAt: '2026-10-14T12:12:00.000Z',
    expiresAt: '2026-10-15T12:12:00.000Z',
    lastSeenAt: '2026-10-14T16:30:00.000Z',
    current: true,
  },
  {
    id: '0199f0a1-0000-7000-8000-000000000002',
    deviceLabel: 'Teléfono de patio',
    platform: 'android',
    createdAt: '2026-10-13T11:40:00.000Z',
    expiresAt: '2026-11-12T11:40:00.000Z',
    lastSeenAt: '2026-10-14T15:00:00.000Z',
    current: false,
  },
  {
    id: '0199f0a1-0000-7000-8000-000000000003',
    deviceLabel: 'Tablet almacén',
    platform: 'android',
    createdAt: '2026-10-14T10:58:00.000Z',
    expiresAt: '2026-10-15T10:58:00.000Z',
    lastSeenAt: '2026-10-14T16:00:00.000Z',
    current: false,
  },
];
const CODES = ['K7QM-3XTP', 'R2HW-9CND', 'F4ZB-7MRK', 'T8JX-2QPV', 'W3NC-6HDF', 'P9KR-4TZM', 'H6VQ-8BXN', 'M2DT-5WJC'];

const profile = (section: ProfileSection | null, extra: Partial<ProfileModel> = {}): ProfileModel => ({
  section,
  mustChange: false,
  open: noop,
  back: noop,
  user: { name: 'Ilén Fernández Rojas', username: 'ilen.fernandez', role: 'Apoderada', phone: '52345678' },
  notice: null,
  busy: null,
  sessions: { status: 'ready', list: SESSIONS },
  sessionCount: SESSIONS.length,
  reloadSessions: noop,
  closeSession: noop,
  closeOthers: noop,
  current: field('current'),
  password: field('password'),
  confirm: field('confirm'),
  passwordSummary: [],
  passwordError: null,
  changingPassword: false,
  submitPassword: asyncNoop,
  codes: null,
  copied: false,
  setCopied: noop,
  confirmRegenerate: false,
  askRegenerate: noop,
  cancelRegenerate: noop,
  regenerate: noop,
  closeCodes: noop,
  theme: 'system',
  setTheme: noop,
  reduceMotion: false,
  setReduceMotion: noop,
  signOut: noop,
  ...extra,
});
const VIEWS = { phone: ProfilePhone, tablet: ProfileTablet, desktop: ProfileDesktop };

export const Inicio: StoryObj = { name: 'Inicio', render: inDevice(VIEWS, profile(null)) };
export const Sesiones: StoryObj = { name: 'Sesiones abiertas', render: inDevice(VIEWS, profile('sesiones')) };
export const Contrasena: StoryObj = {
  name: 'Contraseña con error',
  render: inDevice(
    VIEWS,
    profile('contrasena', {
      current: field('current', 'actual', { error: 'La contraseña actual no es correcta.' }),
      password: field('password', 'nueva-clave'),
      confirm: field('confirm', 'nueva-clave'),
    }),
  ),
};
export const ContrasenaTemporal: StoryObj = {
  name: 'Contraseña temporal',
  render: inDevice(VIEWS, profile('contrasena', { mustChange: true })),
};
export const Codigos: StoryObj = {
  name: 'Códigos nuevos',
  render: inDevice(VIEWS, profile('codigos', { codes: CODES })),
};
export const Apariencia: StoryObj = {
  name: 'Apariencia',
  render: inDevice(VIEWS, profile('apariencia', { theme: 'dark', reduceMotion: true })),
};
