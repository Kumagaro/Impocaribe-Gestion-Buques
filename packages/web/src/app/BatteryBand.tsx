// R-01 y RF-ALR-01: en Android, si la app no está excluida del ahorro de batería, Android puede dormir el servicio que
// trae las alertas con la app cerrada. Mientras sea así, una banda lo dice con el botón para permitirlo; al volver de
// los ajustes de Android se comprueba otra vez.
import { useEffect, useState } from 'react';
import { useOptionalSession } from '../session/SessionProvider';
import { Button } from '../ui/controls';

export function BatteryBand() {
  const battery = useOptionalSession()?.device.batteryExclusion;
  const [excluded, setExcluded] = useState(true);

  useEffect(() => {
    if (!battery) return;
    let alive = true;
    const check = () =>
      void battery.excluded().then(
        (ok) => alive && setExcluded(ok),
        () => undefined,
      );
    check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [battery]);

  if (!battery || excluded) return null;
  return (
    <div role="status" className="ui-band" data-tone="warn">
      Las alertas pueden no llegar con la app cerrada: Android ahorra batería con Órdenes de Carga.
      <Button variant="secondary" onClick={() => void battery.request()}>
        Permitir
      </Button>
    </div>
  );
}
