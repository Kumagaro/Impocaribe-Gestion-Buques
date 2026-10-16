// T038 · A dónde puede ir cada estado de la app: sin emparejar, solo a la conexión (P-01); sin sesión, a las pantallas
// de acceso (P-01 a P-04); con sesión, a la app, y quien debe cambiar la contraseña, solo a su perfil (RF-REC-06).
import { Navigate, Outlet, useLocation } from 'react-router';
import { Skeleton } from '../ui/presentation';
import { useAppSession } from './SessionProvider';

const ACCESS = ['/conexion', '/setup', '/login', '/recuperar'];

export function SessionGate() {
  const { state } = useAppSession();
  const { pathname } = useLocation();
  if (state.status === 'loading') return <Skeleton lines={4} />;
  if (state.status === 'unpaired') return pathname === '/conexion' ? <Outlet /> : <Navigate to="/conexion" replace />;
  if (state.status === 'signedOut') return ACCESS.includes(pathname) ? <Outlet /> : <Navigate to="/login" replace />;
  if (state.session?.user.mustChangePassword && !pathname.startsWith('/perfil'))
    return <Navigate to="/perfil" replace />;
  return ACCESS.includes(pathname) ? <Navigate to="/" replace /> : <Outlet />;
}
