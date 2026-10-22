// T087 · P-14 Borradores (plan §7.3). RF-ORD-06 a 11. Míos: los de este dispositivo (sin subir) y los privados del
// servidor; Compartidos: los de todos los editores, con su autor y quién lo tiene abierto. Abrir lleva a P-13.
import { can } from '@impocaribe/shared';
import type { DeclarationDto, DraftDto, DraftPayload, TruckDto } from '@impocaribe/shared/validation';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { draftsApi } from '../../api/endpoints/orders';
import { useAppSession } from '../../session/SessionProvider';
import { useLocalList, useLocalStore, useServerNow } from '../../sync/SyncProvider';
import { byText, useCatalog, useLocal } from '../catalogs/useCatalog';

export interface DraftRow {
  id: string;
  where: 'device' | 'private' | 'shared';
  payload: DraftPayload;
  updatedAt: string;
  ownerName: string | null;
  lockedByName: string | null;
  lockedById: string | null;
}

export function useDrafts() {
  const base = useCatalog();
  const { state } = useAppSession();
  const store = useLocalStore();
  const now = useServerNow()();
  const navigate = useNavigate();
  const { data: server } = useLocalList<DraftDto>('draft');
  const declarations = useLocal<DeclarationDto>(
    'declaration',
    byText((d) => d.number),
  );
  const trucks = useLocal<TruckDto>(
    'truck',
    byText((t) => t.plate),
  );
  const [device, setDevice] = useState<DraftRow[] | null>(null);
  const [confirm, setConfirm] = useState<DraftRow | null>(null);
  const me = state.session!.user;

  const reload = async () => {
    if (!store) return;
    const list = await store.localDrafts<DraftPayload>();
    setDevice(
      list.map((d) => ({
        id: d.id,
        where: 'device',
        payload: d.payload,
        updatedAt: d.updatedAt,
        ownerName: null,
        lockedByName: null,
        lockedById: null,
      })),
    );
  };
  useEffect(() => {
    void reload();
    return store?.onLocalDraftsChange(() => void reload());
  }, [store, server]);

  const live = (d: DraftDto) => !!d.lockedById && !!d.lockExpiresAt && Date.parse(d.lockExpiresAt) > now.getTime();
  const row = (d: DraftDto): DraftRow => ({
    id: d.id,
    where: d.visibility,
    payload: d.payload,
    updatedAt: d.updatedAt,
    ownerName: d.ownerName,
    lockedByName: live(d) ? d.lockedByName : null,
    lockedById: live(d) ? d.lockedById : null,
  });
  const byDate = (a: DraftRow, b: DraftRow) => b.updatedAt.localeCompare(a.updatedAt);
  const mine = [...(device ?? []), ...(server ?? []).filter((d) => d.visibility === 'private').map(row)].sort(byDate);
  const shared = (server ?? [])
    .filter((d) => d.visibility === 'shared')
    .map(row)
    .sort(byDate);

  return {
    ...base,
    loading: device === null || server === undefined,
    mine,
    shared,
    /** El resumen de un borrador: DM, camión y toneladas, lo que haya. */
    title: (r: DraftRow) => declarations.find((d) => d.id === r.payload.declarationId)?.number ?? 'Sin DM',
    detail: (r: DraftRow) =>
      [trucks.find((t) => t.id === r.payload.truckId)?.plate, r.payload.tons ? `${r.payload.tons} t` : null]
        .filter(Boolean)
        .join(' · ') || 'Sin datos todavía',
    canRelease: (r: DraftRow) =>
      r.where === 'shared' && !!r.lockedById && r.lockedById !== me.id && can(me.role, 'drafts.forceUnlock'),
    open: (r: DraftRow) => navigate(`/ordenes/nueva?borrador=${r.id}`),
    /** RF-ORD-07: lo comparte (uno del dispositivo sube ya como compartido). */
    share: (r: DraftRow) =>
      void base.act(`compartir-${r.id}`, async () => {
        if (r.where === 'device') {
          await base.api().request(draftsApi.save, {
            body: { clientDraftId: r.id, visibility: 'shared', payload: r.payload },
          });
          await store?.deleteLocalDraft(r.id);
        } else await base.api().request(draftsApi.share, { params: { id: r.id } });
        await base.done('Se compartió el borrador.');
        await reload();
      }),
    release: (r: DraftRow) =>
      void base.act(`liberar-${r.id}`, async () => {
        await base.api().request(draftsApi.unlock, { params: { id: r.id } });
        await base.done(`Se liberó el borrador que tenía abierto ${r.lockedByName ?? ''}.`);
      }),
    confirm,
    askDiscard: (r: DraftRow) => setConfirm(r),
    cancelDiscard: () => setConfirm(null),
    /** RF-ORD-11: descartar; el del servidor queda en la bitácora. */
    discard: (r: DraftRow) =>
      void base.act(`descartar-${r.id}`, async () => {
        if (r.where === 'device') await store?.deleteLocalDraft(r.id);
        else await base.api().request(draftsApi.discard, { params: { id: r.id } });
        setConfirm(null);
        await base.done('Se descartó el borrador.');
        await reload();
      }),
  };
}

export type DraftsModel = ReturnType<typeof useDrafts>;
