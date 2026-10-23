// T101 · P-12 Buscar (plan §7.3). RF-TAB-03, 04, 06, RF-CON-07, HU-10: busca en la copia local por número de DM,
// cliente, marca o número de orden (completo o su parte final, «42»), muestra la ficha completa de la DM y, con
// conexión, busca en el archivo lo de más de 12 meses. El texto vive en la dirección (?q=), para volver atrás.
import { can, deadlineAt, declarationStage, parseTons, stageText, type Stage } from '@impocaribe/shared';
import type { ClientDto, DeclarationDto, OrderDto, VesselDto } from '@impocaribe/shared/validation';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { archiveApi } from '../../api/endpoints/consultas';
import { ordersApi } from '../../api/endpoints/orders';
import { declarationsApi } from '../../api/endpoints/vessels';
import { useAppSession } from '../../session/SessionProvider';
import { useLocalList, useServerNow } from '../../sync/SyncProvider';
import { byText, useCatalog, useLocal } from '../catalogs/useCatalog';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** RF-TAB-03: el número completo de la orden o su parte final («42» o «0042» encuentran …-0042). */
export function orderMatches(number: string, q: string): boolean {
  const t = q.trim().toUpperCase();
  if (!t) return false;
  if (number === t) return true;
  return /^\d{1,4}$/.test(t) && number.endsWith(`-${t.padStart(4, '0')}`);
}

/** Por número de DM (o parte), cliente o marca. */
export function declarationMatches(d: { number: string; brand: string }, clientName: string, q: string): boolean {
  const t = fold(q.trim());
  if (!t) return false;
  if (/^\d+$/.test(t)) return d.number.includes(t);
  return fold(clientName).includes(t) || fold(d.brand).includes(t);
}

export interface Ficha {
  declaration: DeclarationDto;
  clientName: string;
  stage: { stage: Stage; expired: boolean };
  stageText: string;
  day: number;
  allocations: { vesselName: string; allocated: string; loaded: string; balance: string }[];
  orders: OrderDto[];
  archived: boolean;
}

export function useSearch() {
  const base = useCatalog();
  const { session, state } = useAppSession();
  const navigate = useNavigate();
  const now = useServerNow()();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const { data: localDeclarations } = useLocalList<DeclarationDto>('declaration');
  const { data: localOrders } = useLocalList<OrderDto>('order');
  const clients = useLocal<ClientDto>(
    'client',
    byText((c) => c.name),
  );
  const vessels = useLocal<VesselDto>(
    'vessel',
    byText((v) => v.name),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archive, setArchive] = useState<{ q: string; declarations: DeclarationDto[]; orders: OrderDto[] } | null>(
    null,
  );

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? '';
  const vesselName = (id: string) => vessels.find((v) => v.id === id)?.name ?? '';
  const declarations = (localDeclarations ?? [])
    .filter((d) => declarationMatches(d, clientName(d.clientId), q))
    .sort((a, b) => b.number.localeCompare(a.number));
  const orders = (localOrders ?? [])
    .filter((o) => orderMatches(o.number, q))
    .sort((a, b) => b.current.loadingDate.localeCompare(a.current.loadingDate));
  const matchingClients =
    q.trim() && !/^\d+$/.test(q.trim()) ? clients.filter((c) => fold(c.name).includes(fold(q.trim()))) : [];
  const archived = archive?.q === q ? archive : null;

  const fichaOf = (d: DeclarationDto, isArchived: boolean): Ficha => {
    const deadline = deadlineAt(d.deadlineStartDate, now);
    const stage = declarationStage({
      total: d.totalTons === null ? null : parseTons(d.totalTons),
      allocations: d.allocations.map((a) => ({
        allocated: parseTons(a.allocatedTons),
        loaded: parseTons(a.loadedTons),
      })),
      expired: d.expiredAt !== null || deadline.expired,
    });
    return {
      declaration: d,
      clientName: clientName(d.clientId),
      stage,
      stageText: stageText(stage),
      day: deadline.day,
      allocations: d.allocations.map((a) => ({
        vesselName: vesselName(a.vesselId),
        allocated: a.allocatedTons,
        loaded: a.loadedTons,
        balance: a.balanceTons,
      })),
      orders: (localOrders ?? [])
        .filter((o) => o.declarationId === d.id)
        .sort((a, b) => b.current.loadingDate.localeCompare(a.current.loadingDate)),
      archived: isArchived,
    };
  };
  const pool = [...declarations, ...(archived?.declarations ?? [])];
  const selected = pool.find((d) => d.id === selectedId);
  const save = async (fileName: string, base64: string) =>
    session.saveFile(
      fileName,
      Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
    );

  return {
    ...base,
    loading: localDeclarations === undefined || localOrders === undefined,
    q,
    setQ: (value: string) => {
      setSelectedId(null);
      setParams(value ? { q: value } : {}, { replace: true });
    },
    declarations: declarations.map((d) => fichaOf(d, false)),
    orders,
    clients: matchingClients.map((c) => ({
      client: c,
      count: (localDeclarations ?? []).filter((d) => d.clientId === c.id).length,
    })),
    archive: archived && {
      declarations: archived.declarations.map((d) => fichaOf(d, true)),
      orders: archived.orders,
    },
    searchArchive: () =>
      void base.act('archivo', async () => {
        const query = { q: q.trim() };
        const [d, o] = await Promise.all([
          base.api().request(archiveApi.declarations, { query }),
          base.api().request(archiveApi.orders, { query }),
        ]);
        setArchive({ q, declarations: d, orders: o });
      }),
    ficha: selected ? fichaOf(selected, !declarations.includes(selected)) : null,
    open: (f: Ficha) => setSelectedId(f.declaration.id),
    back: () => setSelectedId(null),
    openOrder: (o: OrderDto) => navigate(`/ordenes/${o.id}`),
    showClient: (c: ClientDto) => setParams({ q: c.name }, { replace: true }),
    newOrder: can(state.session!.user.role, 'orders.issue')
      ? (f: Ficha) => navigate(`/ordenes/nueva?dm=${f.declaration.id}`)
      : null,
    /** RF-TAB-06. */
    downloadTracking: (f: Ficha) =>
      void base.act(`seguimiento-${f.declaration.id}`, async () => {
        const file = await base.api().request(declarationsApi.tracking, { params: { id: f.declaration.id } });
        await save(file.fileName, file.base64);
        base.setNotice({ tone: 'info', text: `Se descargó el seguimiento de la DM ${f.declaration.number}.` });
      }),
    /** Las órdenes del archivo no están en el dispositivo: se descarga su PDF del servidor. */
    downloadOrder: (o: OrderDto) =>
      void base.act(`pdf-${o.id}`, async () => {
        const file = await base.api().request(ordersApi.pdf, { params: { id: o.id, n: String(o.current.versionNo) } });
        await save(file.fileName, file.base64);
        base.setNotice({ tone: 'info', text: `Se descargó una copia de ${o.number}.` });
      }),
  };
}

export type SearchModel = ReturnType<typeof useSearch>;
