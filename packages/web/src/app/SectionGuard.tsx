// T041 · Guardas de rol en la interfaz (spec §2, EST-05): si se llega por enlace a una sección que el rol no puede
// ver (o que solo existe en la PC servidor), se explica y se ofrece volver. El servidor rechaza igualmente la llamada.
import { Lock } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useAppSession } from '../session/SessionProvider';
import { EmptyState } from '../ui/presentation';
import { sectionForPath, SECTIONS, visibleSections } from './navigation';

export function SectionGuard() {
  const { state } = useAppSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const section = sectionForPath(SECTIONS, pathname);
  const allowed = visibleSections(state.session!.user.role, state.pairing!.isServerPc);
  if (!section || allowed.includes(section)) return <Outlet />;
  return (
    <EmptyState
      icon={<Lock aria-hidden="true" />}
      title="No tiene permiso para ver esta pantalla"
      description={
        section.serverPcOnly
          ? `${section.label} solo se ve en la PC servidor.`
          : `${section.label} no está disponible para su rol.`
      }
      actionLabel="Volver al tablero"
      onAction={() => void navigate('/', { replace: true })}
    />
  );
}
