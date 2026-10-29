// T038 · A dónde puede ir cada estado de la app: sin emparejar, solo a la conexión (P-01) y, en la PC con el instalador
// completo, a crear el servidor (P-28); sin sesión, a las pantallas de acceso (P-01 a P-04) y, en la PC servidor, a su
// estado (P-29); con sesión, a la app, y quien debe cambiar la contraseña, solo a su perfil (RF-REC-06).
import { Navigate, Outlet, useLocation } from 'react-router';
import { DiagnosticsStandalone } from '../screens/diagnostics/DiagnosticsStandalone';
import { PairingAttention } from '../screens/server/PairingAttention';
import { ServerStatusStandalone } from '../screens/server/ServerStatusStandalone';
import { Skeleton } from '../ui/presentation';
import { useAppSession } from './SessionProvider';

const ACCESS = ['/conexion', '/setup', '/login', '/recuperar'];
const UNPAIRED = ['/conexion', '/servidor/crear'];

/** T128: en la PC servidor, las solicitudes de emparejamiento (AL-22) se ven en cualquier pantalla. */
export function SessionGate() {
  const { state } = useAppSession();
  return (
    <>
      <Gate />
      {state.pairing?.isServerPc && <PairingAttention />}
    </>
  );
}

function Gate() {
  const { state } = useAppSession();
  const { pathname } = useLocation();
  if (state.status === 'loading') return <Skeleton lines={4} />;
  // P-30: el diagnóstico de red se abre siempre, con sesión dentro de la estructura y sin ella en su propio marco.
  if (pathname === '/diagnostico' && state.status !== 'signedIn') return <DiagnosticsStandalone />;
  // T127: sin emparejar también se puede crear el servidor en esta PC (P-28, desde P-01).
  if (state.status === 'unpaired')
    return UNPAIRED.includes(pathname) ? <Outlet /> : <Navigate to="/conexion" replace />;
  // T128 · P-29: ante la PC servidor cualquiera ve el estado y confirma emparejamientos, también sin sesión.
  if (state.status === 'signedOut' && pathname === '/servidor' && state.pairing?.isServerPc)
    return <ServerStatusStandalone />;
  if (state.status === 'signedOut') return ACCESS.includes(pathname) ? <Outlet /> : <Navigate to="/login" replace />;
  if (state.session?.user.mustChangePassword && !pathname.startsWith('/perfil'))
    return <Navigate to="/perfil" replace />;
  return ACCESS.includes(pathname) ? <Navigate to="/" replace /> : <Outlet />;
}
