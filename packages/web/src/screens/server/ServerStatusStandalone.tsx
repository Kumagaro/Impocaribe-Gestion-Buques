// T128 · P-29 sin sesión, en la PC servidor: cualquiera presente ve el estado y confirma emparejamientos (ui-spec P-29).
// Revocar dispositivos pide una Apoderada con sesión.
import { useNavigate } from 'react-router';
import { Brand } from '../auth/AuthParts';
import { ServerStatusScreen } from './ServerStatus.screen';

export function ServerStatusStandalone() {
  const navigate = useNavigate();
  return (
    <main className="srv-standalone">
      <div className="srv-standalone__top">
        <Brand />
        <h1 className="wizard__title">Estado del servidor</h1>
        <button type="button" className="auth-link" onClick={() => void navigate('/login')}>
          Iniciar sesión
        </button>
      </div>
      <ServerStatusScreen />
    </main>
  );
}
