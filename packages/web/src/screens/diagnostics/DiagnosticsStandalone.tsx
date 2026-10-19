// T048 · P-30 sin sesión (ui-spec: "cualquiera, incluso sin sesión"): la misma pantalla en el marco de acceso, con
// la vuelta a la pantalla de la que se vino.
import { useNavigate } from 'react-router';
import { useDeviceClass } from '../../ui/device';
import { AuthFrame } from '../auth/AuthParts';
import { DiagnosticsScreen } from './Diagnostics.screen';

export function DiagnosticsStandalone() {
  const navigate = useNavigate();
  return (
    <AuthFrame layout={useDeviceClass() === 'phone' ? 'fullscreen' : 'card'} wide>
      <h1 className="auth-title">Diagnóstico de red</h1>
      <DiagnosticsScreen />
      <button type="button" className="auth-link" onClick={() => void navigate(-1)}>
        Volver
      </button>
    </AuthFrame>
  );
}
