import type { Role } from '@impocaribe/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppShell, type ShellStatus } from './AppShell.screen';
import { SECTIONS } from './navigation';

// T025: la estructura de pantalla. Cambie la clase de dispositivo en la barra superior para ver teléfono, tablet y escritorio.
interface Args {
  role: Role;
  status: ShellStatus;
  isServerPc: boolean;
}

function Shell({ role, status, isServerPc }: Args) {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell user={{ name: 'Ilén Fernández', role }} status={status} isServerPc={isServerPc} />,
        children: [
          ...SECTIONS.map((s) => ({
            path: s.path,
            handle: { title: s.label, subtitle: s.id === 'tablero' ? 'EAGLE 1 · viaje 1' : undefined },
            element: <p>Contenido de {s.label}.</p>,
          })),
          { path: '/buscar', handle: { title: 'Buscar' }, element: <p>Búsqueda.</p> },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  return (
    <div style={{ height: 640, border: '1px solid var(--line)', overflow: 'hidden', transform: 'translateZ(0)' }}>
      <RouterProvider router={router} />
    </div>
  );
}

const ONLINE: ShellStatus = {
  online: true,
  asOf: '14/10/2026 16:40',
  pendingDrafts: 0,
  syncing: false,
  power: null,
  alerts: 3,
};

const meta: Meta<Args> = {
  title: 'Estructura/AppShell',
  render: (args) => <Shell {...args} />,
  args: { role: 'operador', status: ONLINE, isServerPc: false },
  argTypes: { role: { control: 'inline-radio', options: ['apoderada', 'operador', 'lectura'] } },
  parameters: { layout: 'fullscreen' },
};
export default meta;

export const Operador: StoryObj<Args> = {};
export const SoloLectura: StoryObj<Args> = { name: 'Solo lectura', args: { role: 'lectura' } };
export const ApoderadaEnLaPcServidor: StoryObj<Args> = {
  name: 'Apoderada en la PC servidor',
  args: { role: 'apoderada', isServerPc: true },
};
export const SinConexion: StoryObj<Args> = {
  name: 'Sin conexión',
  args: { status: { ...ONLINE, online: false, pendingDrafts: 2 } },
};
export const Sincronizando: StoryObj<Args> = { args: { status: { ...ONLINE, syncing: true } } };
export const ServidorConBateria: StoryObj<Args> = {
  name: 'Servidor con batería',
  args: { status: { ...ONLINE, power: { percent: 38, protected: false } } },
};
export const ModoProtegido: StoryObj<Args> = {
  name: 'Modo protegido',
  args: { status: { ...ONLINE, power: { percent: 9, protected: true } } },
};
