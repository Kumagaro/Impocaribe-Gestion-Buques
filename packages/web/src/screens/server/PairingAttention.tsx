// T128 · AL-22 (spec §5.13, ui-spec P-29): en la PC servidor, una solicitud de emparejamiento nueva trae la ventana al
// frente, aunque esté minimizada o en la bandeja, con el código y Confirmar o Rechazar. Funciona con o sin sesión, en
// cualquier pantalla salvo Estado del servidor, que ya muestra las solicitudes.
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { ApiError } from '../../api/client';
import { localApi } from '../../api/endpoints/local';
import { useAppSession } from '../../session/SessionProvider';
import { Button } from '../../ui/controls';
import { Notice } from '../../ui/presentation';
import { clock } from './SetupParts';
import { PAIRING_EVERY_MS, type PendingPairing } from './useServerStatus';

const PLATFORM = { windows: 'Windows', android: 'Android' } as const;

export function PairingAttention() {
  const { session, state } = useAppSession();
  const { pathname } = useLocation();
  const active = state.pairing?.isServerPc === true && pathname !== '/servidor';
  const [request, setRequest] = useState<PendingPairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => session.now().getTime());
  // Las que ya se mostraron: cada solicitud trae la ventana al frente una sola vez.
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const poll = async () => {
      try {
        const list = await session.api().request(localApi.pairing);
        if (!alive) return;
        setNow(session.now().getTime());
        setRequest((current) => {
          if (current && list.some((r) => r.id === current.id)) return current;
          const fresh = list.find((r) => !seen.current.has(r.id)) ?? null;
          if (fresh) {
            seen.current.add(fresh.id);
            void session.device.attention?.();
          }
          return fresh;
        });
      } catch {
        // Sin servidor no hay solicitudes que mostrar; se vuelve a preguntar en la siguiente vuelta.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), PAIRING_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active, session]);

  if (!active || !request) return null;
  const decide = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await session.api().request(accept ? localApi.confirm : localApi.reject, { params: { id: request.id } });
      setRequest(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo: el servidor no responde.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="srv-toast"
      role="alertdialog"
      aria-label="Solicitud de emparejamiento"
      aria-describedby="srv-toast-text"
    >
      <b>Solicitud de emparejamiento</b>
      <div className="srv-req">
        <span className="srv-req__code" aria-label={`Código ${request.code.split('').join(' ')}`}>
          {request.code.slice(0, 3)} {request.code.slice(3)}
        </span>
        <span className="srv-req__who" id="srv-toast-text">
          <b>{request.deviceName}</b>
          {PLATFORM[request.platform]} · caduca en {clock(Date.parse(request.expiresAt) - now)}
        </span>
      </div>
      <p className="srv-panel__note">Confirme solo si el dispositivo muestra el mismo código.</p>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="srv-req__actions">
        <Button variant="ghost" disabled={busy} onClick={() => void decide(false)}>
          Rechazar
        </Button>
        <Button busy={busy} onClick={() => void decide(true)}>
          Confirmar
        </Button>
      </div>
    </div>
  );
}
