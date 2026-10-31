// T045 · P-01 "Primera sincronización" y RNF-20: hasta tener copia local, la app muestra el progreso de la descarga
// inicial; sin conexión, explica que la primera descarga necesita el servidor. Con copia, deja pasar (sin bloquear
// nada aunque no haya conexión: Const. art. VII.5).
import type { ReactNode } from 'react';
import { ErrorState, Skeleton } from '../ui/presentation';
import { useSyncNow, useSyncStatus } from './SyncProvider';

export function SyncGate({ children }: { children: ReactNode }) {
  const status = useSyncStatus();
  const syncNow = useSyncNow();
  if (status.hasData) return children;
  if (status.stage === 'downloading')
    return (
      <section className="sync-first" aria-labelledby="sync-first-title">
        <h2 id="sync-first-title">Primera sincronización</h2>
        <p role="status">
          Descargando los datos de este dispositivo: {status.received}{' '}
          {status.received === 1 ? 'registro' : 'registros'}.
        </p>
        <Skeleton lines={4} />
      </section>
    );
  if (syncNow && !status.syncing && !status.online)
    return (
      <ErrorState
        message="No hay conexión con el servidor. La primera descarga de datos de este dispositivo lo necesita."
        onRetry={() => void syncNow()}
      />
    );
  return <Skeleton lines={6} />;
}

/** RF-CON-06 y EST-03: el motivo de las escrituras desactivadas sin conexión. */
export const OFFLINE_REASON = 'Requiere conexión con el servidor';
