import type { ReleaseDto } from '@impocaribe/shared/validation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppShell, type ShellStatus } from '../../app/AppShell.screen';
import { asyncNoop, inDevice, noop } from '../story-helpers';
import { AppUpdateContext, type AppUpdate } from './AppUpdateProvider';
import { ReleasesDesktop } from './Releases.desktop';
import { ReleasesPhone } from './Releases.phone';
import { ReleasesTablet } from './Releases.tablet';
import { UpgradeRequired } from './UpdateParts';
import type { ReleasesModel } from './useReleases';

// T114 · P-26, AL-15 y EST-07 (maqueta T114): cada estado con un modelo fijo, sin servidor. Datos ficticios.
const meta: Meta = { title: 'Pantallas/Versiones' };
export default meta;

const VIEWS = { phone: ReleasesPhone, tablet: ReleasesTablet, desktop: ReleasesDesktop };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const release = (n: number, extra: Partial<ReleaseDto> = {}): ReleaseDto => ({
  id: id(n),
  platform: 'windows',
  version: '1.4.0',
  sha256: 'a'.repeat(64),
  sizeBytes: 96_888_422,
  notes: 'Tablero más rápido; la orden muestra el chofer en el encabezado.',
  isMinSupported: false,
  devicesBelow: 2,
  publishedByName: 'Ilén Fernández',
  publishedAt: '2026-10-24T19:20:00.000Z',
  ...extra,
});
const RELEASES = [
  release(1),
  release(2, {
    version: '1.3.0',
    isMinSupported: true,
    sizeBytes: 96_259_276,
    notes: 'Respaldos y restauración. Cambia la API: las anteriores ya no sirven.',
    publishedAt: '2026-10-02T13:05:00.000Z',
    devicesBelow: 0,
  }),
  release(3, {
    version: '1.2.1',
    sizeBytes: 94_581_555,
    notes: 'Corrige la impresión del cuño en algunas impresoras.',
    publishedAt: '2026-09-18T15:40:00.000Z',
    devicesBelow: 0,
  }),
];

const model = (extra: Partial<ReleasesModel> = {}): ReleasesModel => ({
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
  loading: false,
  failed: false,
  retry: noop,
  canPublish: true,
  thisDevice: { label: 'Esta PC', version: '1.3.0', newer: '1.4.0' },
  platform: 'windows',
  setPlatform: noop,
  releases: RELEASES,
  isApp: true,
  latestOf: () => RELEASES[0]!,
  form: null,
  errors: {},
  formError: null,
  uploading: false,
  openPublish: noop,
  closePublish: noop,
  setField: noop,
  publish: asyncNoop,
  confirming: null,
  askMin: noop,
  cancelMin: noop,
  markMin: noop,
  ...extra,
});

export const Versiones: StoryObj = { render: inDevice(VIEWS, model()) };
export const VersionesSoloLectura: StoryObj = {
  render: inDevice(
    VIEWS,
    model({ canPublish: false, thisDevice: { label: 'Esta PC', version: '1.4.0', newer: null } }),
  ),
};
export const Publicar: StoryObj = {
  render: inDevice(
    VIEWS,
    model({
      form: {
        platform: 'windows',
        version: '1.4',
        notes: 'Tablero más rápido.',
        file: new File([new Uint8Array(1024)], 'impocaribe-1.4.0.exe'),
        signature: new File(['firma'], 'impocaribe-1.4.0.exe.sig'),
      },
      errors: { version: 'Escriba la versión con tres números separados por puntos, por ejemplo 1.4.2.' },
    }),
  ),
};
export const MarcarMinima: StoryObj = { render: inDevice(VIEWS, model({ confirming: RELEASES[0]! })) };
export const SinConexion: StoryObj = { render: inDevice(VIEWS, model({ connected: false })) };

// ---------- AL-15 y EST-07 ----------

const update = (extra: Partial<AppUpdate> = {}): AppUpdate => ({
  current: '1.3.0',
  latest: '1.4.0',
  notes: 'Tablero más rápido; la orden muestra el chofer.',
  available: true,
  requiredMin: null,
  showBand: true,
  later: noop,
  canInstall: true,
  install: noop,
  installing: false,
  progress: null,
  error: null,
  ...extra,
});
const ONLINE: ShellStatus = {
  online: true,
  asOf: '24/10/2026 15:40',
  pendingDrafts: 0,
  syncing: false,
  power: null,
  alerts: 1,
};

function WithShell({ value }: { value: AppUpdate }) {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell user={{ name: 'Mario Delgado', role: 'operador' }} status={ONLINE} />,
        children: [{ path: '/', handle: { title: 'Tablero' }, element: <p>Contenido del tablero.</p> }],
      },
    ],
    { initialEntries: ['/'] },
  );
  return (
    <AppUpdateContext.Provider value={value}>
      <div style={{ height: 560, overflow: 'hidden', transform: 'translateZ(0)' }}>
        <RouterProvider router={router} />
      </div>
    </AppUpdateContext.Provider>
  );
}

export const VersionNueva: StoryObj = { render: () => <WithShell value={update()} /> };
export const Descargando: StoryObj = {
  render: () => (
    <WithShell value={update({ installing: true, progress: { received: 25_165_824, total: 40_475_033 } })} />
  ),
};
export const ActualizacionObligatoria: StoryObj = {
  render: () => (
    <AppUpdateContext.Provider
      value={update({ current: '1.2.1', available: false, showBand: false, requiredMin: '1.3.0' })}
    >
      <div style={{ height: 560 }}>
        <UpgradeRequired drafts={3} onDrafts={noop} />
      </div>
    </AppUpdateContext.Provider>
  ),
};
