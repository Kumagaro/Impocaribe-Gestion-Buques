// T038 · Las rutas de la app (ui-spec §4): las de acceso, a pantalla completa, y las demás dentro de la estructura
// (T025). Cada pantalla se añade aquí con su tarea.
import type { RouteObject } from 'react-router';
import { ConnectionScreen } from '../screens/connection/Connection.screen';
import { LoginScreen } from '../screens/login/Login.screen';
import { ProfileScreen } from '../screens/profile/Profile.screen';
import { RecoverScreen } from '../screens/recover/Recover.screen';
import { SetupScreen } from '../screens/setup/Setup.screen';
import { UsersScreen } from '../screens/users/Users.screen';
import { SessionGate } from '../session/SessionGate';
import { useAppSession } from '../session/SessionProvider';
import { EmptyState } from '../ui/presentation';
import { AppShell, type ShellStatus } from './AppShell.screen';
import { SectionGuard } from './SectionGuard';

// shortcut: la conexión, la copia local y las alertas llegan con la sincronización (T046); hasta entonces, en línea y
// sin pendientes.
const STATUS: ShellStatus = { online: true, asOf: '', pendingDrafts: 0, syncing: false, power: null, alerts: 0 };

function SignedIn() {
  const { session, state } = useAppSession();
  const user = state.session!.user;
  return (
    <AppShell
      user={{ name: user.fullName, role: user.role }}
      status={STATUS}
      isServerPc={state.pairing!.isServerPc}
      theme={state.preferences.theme}
      onThemeChange={(theme) => void session.setPreferences({ theme })}
    />
  );
}

function Pending({ what }: { what: string }) {
  return <EmptyState title={what} description="Esta parte de la app aún no está disponible." />;
}

export const appRoutes: RouteObject[] = [
  {
    element: <SessionGate />,
    children: [
      { path: '/conexion', element: <ConnectionScreen /> },
      { path: '/setup', element: <SetupScreen /> },
      { path: '/login', element: <LoginScreen /> },
      { path: '/recuperar', element: <RecoverScreen /> },
      {
        element: <SignedIn />,
        children: [
          {
            // T041: cada sección pide su permiso (navigation.ts); sin él, se explica en vez de mostrarla.
            element: <SectionGuard />,
            children: [
              { path: '/', handle: { title: 'Tablero' }, element: <Pending what="Tablero" /> },
              { path: '/perfil/:seccion?', handle: { title: 'Perfil' }, element: <ProfileScreen /> },
              { path: '/usuarios', handle: { title: 'Usuarios' }, element: <UsersScreen /> },
              {
                path: '*',
                handle: { title: 'Órdenes de Carga' },
                element: <EmptyState title="No se encontró la página" />,
              },
            ],
          },
        ],
      },
    ],
  },
];
