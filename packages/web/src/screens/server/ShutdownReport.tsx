// T133 · RF-INS-09 y P-31: en la PC servidor, la app dice a su parte nativa cuántos dispositivos hay conectados, para
// el motivo que muestra Windows al apagar o reiniciar («hay X dispositivos conectados»). Lo pide la interfaz porque
// /local/* exige la firma del dispositivo, que ya hace ella. Funciona con o sin sesión; no muestra nada.
import { useEffect } from 'react';
import { localApi } from '../../api/endpoints/local';
import { useAppSession } from '../../session/SessionProvider';

/** Cada cuánto se actualiza el número (el aviso de Windows usa el último). */
export const SHUTDOWN_REPORT_EVERY_MS = 30_000;

export function ShutdownReport() {
  const { session, state } = useAppSession();
  const serverPc = state.pairing?.isServerPc === true;
  useEffect(() => {
    const report = session.device.reportServerPc;
    if (!report) return;
    if (!serverPc) {
      void report(null);
      return;
    }
    let alive = true;
    const tick = async () => {
      try {
        const s = await session.api().request(localApi.status);
        if (alive) await report(s.devices.filter((d) => d.connected).length);
      } catch {
        // Sin respuesta del servidor se queda el último número: el aviso sigue diciendo que esta PC es la servidor.
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), SHUTDOWN_REPORT_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [serverPc, session]);
  return null;
}
