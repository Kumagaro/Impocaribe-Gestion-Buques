// T046 · Const. art. VII y plan §7.1: las pantallas leen de la copia local con TanStack Query; cada sincronización
// invalida solo las consultas de las entidades que cambiaron y marca sus filas para el resaltado de MOV-02.
import { ALERTS, can, type AlertType } from '@impocaribe/shared';
import type { DraftPayload, SyncEntity } from '@impocaribe/shared/validation';
import { draftsApi } from '../api/endpoints/orders';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LocalStore } from '../local/local-store';
import { liveRowHighlight } from '../motion/presets';
import { useAppSession } from '../session/SessionProvider';
import type { SyncEngine, SyncStatus } from './engine';

interface SyncContextValue {
  engine: SyncEngine;
  store: LocalStore;
}
const SyncContext = createContext<SyncContextValue | null>(null);

const IDLE: SyncStatus = {
  stage: 'idle',
  online: false,
  syncedAt: null,
  hasData: false,
  received: 0,
  clockSkewMs: null,
  syncing: false,
};
const noop = () => () => undefined;

/** Con sesión: arranca la sincronización de la sesión y conecta sus avisos con las consultas locales. */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { session, state } = useAppSession();
  const queryClient = useQueryClient();
  const [value, setValue] = useState<SyncContextValue | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const store = await session.localStore();
      const engine = await session.startSync();
      if (alive) setValue({ engine, store });
    })();
    return () => {
      alive = false;
    };
  }, [session]);

  useEffect(() => {
    if (!value) return;
    return value.engine.onChange(({ entities }) => {
      for (const entity of entities) void queryClient.invalidateQueries({ queryKey: ['local', entity] });
    });
  }, [value, queryClient]);

  // T098 · RF-ALR-01, 02: con la app abierta, cada alerta nueva sale también como notificación del sistema, con solo
  // el tipo y la referencia.
  useEffect(() => {
    if (!value) return;
    return value.engine.onAlert((a) => {
      const label = ALERTS[a.type as AlertType]?.label ?? 'Alerta';
      void session.notify({ title: `Alerta: ${label}`, body: a.title }).catch(() => undefined);
    });
  }, [value, session]);

  // RF-ORD-08: al recuperar la conexión, los borradores de este dispositivo suben como privados de su autor.
  const online = useSyncExternalStore(value?.engine.subscribe ?? noop, () => value?.engine.status().online ?? false);
  const role = state.session?.user.role;
  useEffect(() => {
    if (!value || !online || !role || !can(role, 'drafts.edit')) return;
    void uploadLocalDrafts(value.store, session).catch(() => undefined);
  }, [value, online, role, session]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

async function uploadLocalDrafts(store: LocalStore, session: ReturnType<typeof useAppSession>['session']) {
  const list = await store.localDrafts<DraftPayload>();
  if (list.length === 0) return;
  await session.api().request(draftsApi.sync, {
    body: { drafts: list.map((d) => ({ clientDraftId: d.id, payload: d.payload })) },
  });
  for (const d of list) await store.deleteLocalDraft(d.id);
}

function useSync(): SyncContextValue | null {
  return useContext(SyncContext);
}

/** El estado de la sincronización (banda de conexión, primera descarga, hora desfasada). */
export function useSyncStatus(): SyncStatus {
  const engine = useSync()?.engine;
  return useSyncExternalStore(engine?.subscribe ?? noop, engine?.status ?? (() => IDLE));
}

/**
 * RF-CON-06: sin conexión no se escribe nada de negocio. Hasta la primera respuesta del servidor no se sabe, y no se
 * desactiva nada por una desconexión que quizá no existe.
 */
export function useOnline(): boolean {
  const status = useSyncStatus();
  return status.online || status.stage === 'idle';
}

/** Una entidad de la copia local, al día con cada sincronización (T046). */
export function useLocalList<T>(entity: SyncEntity) {
  const store = useSync()?.store;
  return useQuery({
    queryKey: ['local', entity],
    queryFn: () => store!.list<T>(entity),
    enabled: store !== undefined,
  });
}

/** MOV-02: los ids de `entity` que cambió la sincronización en el último 1,5 s. */
export function useRecentlyChanged(entity: SyncEntity): ReadonlySet<string> {
  const engine = useSync()?.engine;
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!engine) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const off = engine.onChange(({ entities, ids }) => {
      if (!entities.includes(entity)) return;
      setChanged((prev) => new Set([...prev, ...ids]));
      timers.push(
        setTimeout(
          () => setChanged((prev) => new Set([...prev].filter((id) => !ids.includes(id)))),
          liveRowHighlight(false).holdMs,
        ),
      );
    });
    return () => {
      off();
      for (const t of timers) clearTimeout(t);
    };
  }, [engine, entity]);
  return changed;
}

/** Sincroniza ya (tras una escritura propia, plan §5.9); null mientras la sincronización no arrancó. */
export function useSyncNow(): (() => Promise<void>) | null {
  const engine = useSync()?.engine;
  return engine ? () => engine.syncNow() : null;
}

/**
 * La hora del servidor estimada con el desfase medido en la última sincronización (RF-CON-10): los plazos que se
 * muestran (RF-PLZ-05) la usan, no la del dispositivo.
 */
export function useServerNow(): () => Date {
  const { session } = useAppSession();
  const skew = useSyncStatus().clockSkewMs ?? 0;
  return () => new Date(session.now().getTime() - skew);
}

/** La copia local, para lo que no es una lista replicada (los borradores de este dispositivo, RF-ORD-06). */
export function useLocalStore(): LocalStore | null {
  return useSync()?.store ?? null;
}
