// T096 y T097 · RF-ALR-01, 05 y spec §5.13: las alertas que ve este usuario. Las del servidor llegan por la copia
// local (cada uno recibe solo las suyas); las solo locales (AL-13, 14) las calcula el dispositivo y no salen de él.
import { havanaDateTime, type AlertType } from '@impocaribe/shared';
import type { AlertDto } from '@impocaribe/shared/validation';
import { useEffect, useState } from 'react';
import { useLocalList, useLocalStore, useSyncStatus } from '../../sync/SyncProvider';

export interface AlertRow {
  id: string;
  type: AlertType;
  kind: 'condition' | 'event' | 'local';
  title: string;
  detail: string;
  status: AlertDto['status'];
  /** null en las locales: valen mientras dura su causa. */
  createdAt: string | null;
  attendedByName: string | null;
  attendedAt: string | null;
  entityType: string | null;
  entityId: string | null;
}

export const fromServer = (a: AlertDto): AlertRow => ({
  id: a.id,
  type: a.type as AlertType,
  kind: a.kind,
  title: a.title,
  detail: a.detail,
  status: a.status,
  createdAt: a.createdAt,
  attendedByName: a.attendedByName,
  attendedAt: a.attendedAt,
  entityType: a.entityType,
  entityId: a.entityId,
});

const local = (type: AlertType, title: string, detail: string, entityType: string | null = null): AlertRow => ({
  id: `local-${type}`,
  type,
  kind: 'local',
  title,
  detail,
  status: 'open',
  createdAt: null,
  attendedByName: null,
  attendedAt: null,
  entityType,
  entityId: null,
});

/** Los borradores que solo están en este dispositivo (AL-14 y la banda de sin conexión). */
export function useLocalDraftCount(): number {
  const store = useLocalStore();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!store) return;
    const read = () => void store.localDrafts().then((list) => setCount(list.length));
    read();
    return store.onLocalDraftsChange(read);
  }, [store]);
  return count;
}

export function useAlertFeed() {
  const { data } = useLocalList<AlertDto>('alert');
  const sync = useSyncStatus();
  const drafts = useLocalDraftCount();
  const offline = !sync.online && sync.stage !== 'idle';
  const locals: AlertRow[] = [];
  if (offline)
    locals.push(
      local(
        'AL-13',
        'Sin conexión con el servidor',
        `Datos al ${sync.syncedAt ? havanaDateTime(new Date(sync.syncedAt)) : 'sin datos'}. Lo que escriba queda como borrador en este dispositivo.`,
      ),
    );
  if (drafts > 0)
    locals.push(
      local(
        'AL-14',
        drafts === 1 ? '1 borrador sin subir' : `${drafts} borradores sin subir`,
        'Se suben como privados en cuanto vuelva la conexión.',
        'draft',
      ),
    );
  // shortcut: AL-15 (versión nueva de la app) llega con la publicación de versiones (T113 y T114).
  const server = (data ?? []).map(fromServer).sort((a, b) => b.createdAt!.localeCompare(a.createdAt!));
  return {
    loading: data === undefined,
    locals,
    server,
    /** El contador de la campana: las abiertas, del servidor y de este dispositivo. */
    open: locals.length + server.filter((a) => a.status === 'open').length,
    drafts,
  };
}
