// T114 · RF-UPD-02 a 05, AL-15 y EST-07: la app pregunta al servidor si hay una versión nueva al iniciar sesión, cada
// hora y cuando el WebSocket avisa de una publicación. Con una nueva, la banda de AL-15 («Actualizar ahora» o «Más
// tarde», que la oculta un día) y la alerta local; por debajo de la mínima (o tras un 426), la pantalla EST-07.
import type { UpdateCheck } from '@impocaribe/shared/validation';
import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { updatesApi } from '../../api/endpoints/updates';
import { useAppSession } from '../../session/SessionProvider';
import { useAppUpdateNotices, useOnline } from '../../sync/SyncProvider';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface AppUpdate {
  /** La versión instalada. */
  current: string;
  /** La más nueva publicada para esta plataforma, con sus novedades. */
  latest: string | null;
  notes: string | null;
  /** RF-UPD-03: hay una más nueva (y la instalada sigue siendo compatible). */
  available: boolean;
  /** RF-UPD-04 (EST-07): la mínima compatible, si la instalada está por debajo. */
  requiredMin: string | null;
  /** La banda de AL-15: hay una nueva y no se pidió «Más tarde» para ella. */
  showBand: boolean;
  later(): void;
  /** El navegador de pruebas no puede instalar; las apps sí. */
  canInstall: boolean;
  install(): void;
  installing: boolean;
  progress: { received: number; total: number } | null;
  error: string | null;
}

/** Exportado para las historias, que dan un estado fijo. */
export const AppUpdateContext = createContext<AppUpdate | null>(null);

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const { session, state } = useAppSession();
  const online = useOnline();
  const app = session.app();
  const check = useQuery({
    queryKey: ['update-check', app.platform, app.version],
    enabled: online,
    staleTime: HOUR_MS,
    refetchInterval: HOUR_MS,
    queryFn: () => session.api().request(updatesApi.check, { query: { platform: app.platform, version: app.version } }),
  });
  const { refetch } = check;
  useAppUpdateNotices(useCallback((u) => void (u.platform === app.platform && refetch()), [app.platform, refetch]));
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<AppUpdate['progress']>(null);
  const [error, setError] = useState<string | null>(null);

  const data: UpdateCheck | undefined = check.data;
  const requiredMin = data?.mustUpdate ? data.minSupported : (state.upgradeRequired?.minVersion ?? null);
  const available = !requiredMin && (data?.updateAvailable ?? false);
  const later = state.preferences.updateLater;
  const postponed =
    later !== undefined && later.version === data?.latest && Date.parse(later.until) > session.now().getTime();

  const value: AppUpdate = {
    current: app.version,
    latest: data?.latest ?? null,
    notes: data?.notes ?? null,
    available,
    requiredMin,
    showBand: available && !postponed,
    later: () =>
      void session.setPreferences({
        updateLater: { version: data!.latest!, until: new Date(session.now().getTime() + DAY_MS).toISOString() },
      }),
    canInstall: app.canInstall,
    install: () => {
      if (!data?.downloadUrl || !data.latest || !data.sha256 || installing) return;
      setInstalling(true);
      setError(null);
      setProgress(null);
      session
        .installUpdate(
          { downloadUrl: data.downloadUrl, version: data.latest, sha256: data.sha256 },
          (received, total) => setProgress({ received, total }),
        )
        .catch((e: unknown) =>
          setError(
            e instanceof ApiError || e instanceof Error
              ? `No se pudo actualizar: ${e.message}`
              : 'No se pudo actualizar. Inténtelo de nuevo.',
          ),
        )
        .finally(() => setInstalling(false));
    },
    installing,
    progress,
    error,
  };
  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}

/** El estado de actualización; null fuera del proveedor (pantallas sin sesión y pruebas de una sola pantalla). */
export function useAppUpdate(): AppUpdate | null {
  return useContext(AppUpdateContext);
}

/** «24,0 de 38,6 MB». */
export const megabytes = (received: number, total: number) =>
  `${(received / 1_048_576).toFixed(1).replace('.', ',')} de ${(total / 1_048_576).toFixed(1).replace('.', ',')} MB`;
