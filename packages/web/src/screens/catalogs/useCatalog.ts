// T058 y T059 · Lo común de P-18 a P-20 (plan §7.3): quién puede cambiar (EST-05), sin conexión (RF-CON-06), el aviso
// de lo hecho y la espera a que la sincronización traiga el cambio a la copia local (Const. art. VII).
import { can } from '@impocaribe/shared';
import type { SyncEntity } from '@impocaribe/shared/validation';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useAppSession } from '../../session/SessionProvider';
import { OFFLINE_REASON } from '../../sync/SyncGate';
import { useLocalList, useOnline, useSyncNow } from '../../sync/SyncProvider';

export type Notice = { tone: 'info' | 'bad'; text: string } | null;

const messageOf = (err: unknown) =>
  err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor. Inténtelo de nuevo.';

/** Una lista de la copia local, ordenada; vacía mientras se lee. */
export function useLocal<T>(entity: SyncEntity, order: (a: T, b: T) => number): T[] {
  const { data } = useLocalList<T>(entity);
  return data ? [...data].sort(order) : [];
}

export const byText =
  <T>(key: (x: T) => string) =>
  (a: T, b: T) =>
    key(a).localeCompare(key(b), 'es');

export function useCatalog() {
  const { session, state } = useAppSession();
  const online = useOnline();
  const syncNow = useSyncNow();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /** Tras escribir, la sincronización trae el cambio; el aviso dice qué se hizo. */
  const done = async (text: string) => {
    setNotice({ tone: 'info', text });
    await syncNow?.();
  };

  /** Una acción sin formulario (activar, desactivar): su error se muestra como aviso. */
  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setNotice({ tone: 'bad', text: messageOf(err) });
    } finally {
      setBusy(null);
    }
  };

  return {
    api: () => session.api(),
    canEdit: can(state.session!.user.role, 'catalogs.toggle'),
    offlineReason: online ? undefined : OFFLINE_REASON,
    notice,
    setNotice,
    busy,
    done,
    act,
  };
}
