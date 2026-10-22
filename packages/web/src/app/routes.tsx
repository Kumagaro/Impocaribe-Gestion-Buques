// T038 · Las rutas de la app (ui-spec §4): las de acceso, a pantalla completa, y las demás dentro de la estructura
// (T025). Cada pantalla se añade aquí con su tarea.
import { havanaDateTime } from '@impocaribe/shared';
import { useEffect } from 'react';
import type { RouteObject } from 'react-router';
import { CarriersScreen } from '../screens/catalogs/Carriers.screen';
import { ClientsScreen } from '../screens/catalogs/Clients.screen';
import { FleetScreen } from '../screens/catalogs/Fleet.screen';
import { DeclarationsScreen } from '../screens/declarations/Declarations.screen';
import { VesselsScreen } from '../screens/vessels/Vessels.screen';
import { NewOrderScreen } from '../screens/orders/NewOrder.screen';
import { OrderScreen } from '../screens/orders/Order.screen';
import { CorrectOrderScreen } from '../screens/orders/CorrectOrder.screen';
import { DraftsScreen } from '../screens/orders/Drafts.screen';
import { CompanyScreen } from '../screens/company/Company.screen';
import { ConnectionScreen } from '../screens/connection/Connection.screen';
import { DiagnosticsScreen } from '../screens/diagnostics/Diagnostics.screen';
import { LoginScreen } from '../screens/login/Login.screen';
import { ProfileScreen } from '../screens/profile/Profile.screen';
import { RecoverScreen } from '../screens/recover/Recover.screen';
import { SettingsScreen } from '../screens/settings/Settings.screen';
import { SetupScreen } from '../screens/setup/Setup.screen';
import { UsersScreen } from '../screens/users/Users.screen';
import { SessionGate } from '../session/SessionGate';
import { useAppSession } from '../session/SessionProvider';
import { SyncGate } from '../sync/SyncGate';
import { SyncProvider, useOnline, useSyncStatus } from '../sync/SyncProvider';
import { EmptyState } from '../ui/presentation';
import { AppShell, type ShellStatus } from './AppShell.screen';
import { SectionGuard } from './SectionGuard';

/** RF-AUT-09: sin conexión, una sesión vencida deja consultar la copia local 72 horas más. */
export const OFFLINE_GRACE_MS = 72 * 3_600_000;
const SKEW_LIMIT_MS = 5 * 60_000;

function SignedIn() {
  return (
    <SyncProvider>
      <SignedInShell />
    </SyncProvider>
  );
}

function SignedInShell() {
  const { session, state } = useAppSession();
  const sync = useSyncStatus();
  const online = useOnline();
  const user = state.session!.user;
  const expiresAt = Date.parse(state.session!.expiresAt);

  // La hora que cuenta es la del servidor: la del dispositivo corregida por el desfase medido (plan §9).
  useEffect(() => {
    const check = () => {
      const serverNow = session.now().getTime() - (sync.clockSkewMs ?? 0);
      if (!online && serverNow > expiresAt + OFFLINE_GRACE_MS) void session.signOut();
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [session, online, sync.clockSkewMs, expiresAt]);

  const status: ShellStatus = {
    online,
    asOf: sync.syncedAt ? havanaDateTime(new Date(sync.syncedAt)) : 'sin datos',
    pendingDrafts: 0,
    syncing: sync.syncing,
    // shortcut: energía (F10) y alertas (F7) llegan con sus fases; hasta entonces, con corriente y sin alertas.
    power: null,
    alerts: 0,
    clockSkewMinutes:
      sync.clockSkewMs !== null && Math.abs(sync.clockSkewMs) > SKEW_LIMIT_MS
        ? Math.round(Math.abs(sync.clockSkewMs) / 60_000)
        : null,
  };
  return (
    <AppShell
      user={{ name: user.fullName, role: user.role }}
      status={status}
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
          // P-30: también sin copia local, que es cuando más falta hace saber por qué no llega el servidor.
          { path: '/diagnostico', handle: { title: 'Diagnóstico de red' }, element: <DiagnosticsScreen /> },
          {
            // T041: cada sección pide su permiso (navigation.ts); sin él, se explica en vez de mostrarla. T045: hasta
            // tener copia local, la primera descarga.
            element: (
              <SyncGate>
                <SectionGuard />
              </SyncGate>
            ),
            children: [
              { path: '/', handle: { title: 'Tablero' }, element: <Pending what="Tablero" /> },
              { path: '/perfil/:seccion?', handle: { title: 'Perfil' }, element: <ProfileScreen /> },
              { path: '/usuarios', handle: { title: 'Usuarios' }, element: <UsersScreen /> },
              { path: '/empresa', handle: { title: 'Empresa' }, element: <CompanyScreen /> },
              { path: '/configuracion', handle: { title: 'Configuración' }, element: <SettingsScreen /> },
              { path: '/borradores', handle: { title: 'Borradores' }, element: <DraftsScreen /> },
              { path: '/ordenes/nueva', handle: { title: 'Nueva orden' }, element: <NewOrderScreen /> },
              { path: '/ordenes/:id', handle: { title: 'Orden' }, element: <OrderScreen /> },
              {
                path: '/ordenes/:id/corregir',
                handle: { title: 'Corregir la orden' },
                element: <CorrectOrderScreen />,
              },
              { path: '/buques/:id?', handle: { title: 'Buques' }, element: <VesselsScreen /> },
              { path: '/dm/:id?', handle: { title: 'DM' }, element: <DeclarationsScreen /> },
              { path: '/catalogos/transportistas', handle: { title: 'Transportistas' }, element: <CarriersScreen /> },
              { path: '/catalogos/clientes', handle: { title: 'Clientes' }, element: <ClientsScreen /> },
              {
                path: '/catalogos/choferes-camiones',
                handle: { title: 'Choferes y camiones' },
                element: <FleetScreen />,
              },
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
