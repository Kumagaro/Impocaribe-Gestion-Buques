// T086 y T087 · P-13 Nueva orden con sus borradores (RF-ORD-06 a 11). Lo que se escribe se guarda solo en este
// dispositivo, también sin conexión. «Guardar borrador» lo comparte. Un borrador del servidor se abre con su bloqueo
// (si es compartido), que se renueva cada 60 s y se suelta al salir.
import type { DraftDto, DraftPayload, OrderDto } from '@impocaribe/shared/validation';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../../api/client';
import { draftsApi } from '../../api/endpoints/orders';
import { useAppSession } from '../../session/SessionProvider';
import { useLocalList, useLocalStore } from '../../sync/SyncProvider';
import { useCatalog } from '../catalogs/useCatalog';

const HEARTBEAT_MS = 60_000;
const SAVE_DELAY_MS = 800;

export type DraftSource =
  | { kind: 'new'; id: string }
  | { kind: 'local'; id: string; payload: DraftPayload }
  | { kind: 'server'; draft: DraftDto };

/** Abre lo pedido en `?borrador=`: un borrador de este dispositivo, uno del servidor, o uno nuevo. */
export function useDraftSource(): { source: DraftSource | null; lockedBy: string | null } {
  const [params] = useSearchParams();
  const wanted = params.get('borrador');
  const store = useLocalStore();
  const { data: serverDrafts } = useLocalList<DraftDto>('draft');
  const [source, setSource] = useState<DraftSource | null>(null);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const base = useCatalog();

  useEffect(() => {
    if (source || !store || !serverDrafts) return;
    void (async () => {
      if (!wanted) return setSource({ kind: 'new', id: crypto.randomUUID() });
      const local = (await store.localDrafts<DraftPayload>()).find((d) => d.id === wanted);
      if (local) return setSource({ kind: 'local', id: local.id, payload: local.payload });
      const draft = serverDrafts.find((d) => d.id === wanted);
      if (!draft) return setSource({ kind: 'new', id: crypto.randomUUID() });
      if (draft.visibility === 'shared')
        try {
          await base.api().request(draftsApi.lock, { params: { id: draft.id } });
        } catch (e) {
          if (e instanceof ApiError && e.code === 'DRAFT_LOCKED') setLockedBy(String(e.details?.lockedBy ?? ''));
          else throw e;
        }
      setSource({ kind: 'server', draft });
    })();
  }, [store, serverDrafts, wanted, source]);

  // RF-ORD-09: el bloqueo se renueva mientras está abierto y se suelta al salir.
  const shared = source?.kind === 'server' && source.draft.visibility === 'shared' && !lockedBy;
  const id = source?.kind === 'server' ? source.draft.id : null;
  useEffect(() => {
    if (!shared || !id) return;
    const timer = setInterval(
      () =>
        void base
          .api()
          .request(draftsApi.heartbeat, { params: { id } })
          .catch(() => undefined),
      HEARTBEAT_MS,
    );
    return () => {
      clearInterval(timer);
      void base
        .api()
        .request(draftsApi.unlock, { params: { id } })
        .catch(() => undefined);
    };
  }, [shared, id]);

  return { source, lockedBy };
}

export function useNewOrderDrafts(source: DraftSource | null) {
  const base = useCatalog();
  const { session } = useAppSession();
  const store = useLocalStore();
  const navigate = useNavigate();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef<DraftPayload | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const localId = source?.kind === 'server' ? null : (source?.id ?? null);
  const serverId = source?.kind === 'server' ? source.draft.id : null;

  /** RF-ORD-06: se guarda mientras se escribe; un borrador del servidor, en el servidor (si hay conexión). */
  const onChange = (payload: DraftPayload) => {
    latest.current = payload;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const at = session.now().toISOString();
      if (localId && store) void store.saveLocalDraft(localId, payload, at).then(() => setSavedAt(at));
      else if (serverId && !base.offlineReason)
        void base
          .api()
          .request(draftsApi.edit, { params: { id: serverId }, body: { payload } })
          .then(
            () => setSavedAt(at),
            () => undefined,
          );
    }, SAVE_DELAY_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    onChange,
    savedAt,
    draftId: serverId ?? undefined,
    /** RF-ORD-07: lo que se lleva escrito pasa a ser un borrador compartido, en el servidor. */
    share: () =>
      void base.act('borrador', async () => {
        clearTimeout(timer.current);
        const payload = latest.current ?? {};
        if (localId) {
          await base.api().request(draftsApi.save, {
            body: { clientDraftId: localId, visibility: 'shared', payload },
          });
          await store?.deleteLocalDraft(localId);
        } else if (serverId) {
          await base.api().request(draftsApi.edit, { params: { id: serverId }, body: { payload } });
          if (source?.kind === 'server' && source.draft.visibility === 'private')
            await base.api().request(draftsApi.share, { params: { id: serverId } });
        }
        await base.done('Se guardó el borrador: ya lo ven las Apoderadas y los Operadores.');
        navigate('/borradores');
      }),
    /** Tras emitir: el borrador local ya no hace falta (el del servidor lo cierra el servidor). */
    issued: async (order: OrderDto) => {
      clearTimeout(timer.current);
      if (localId) await store?.deleteLocalDraft(localId);
      return order;
    },
  };
}
