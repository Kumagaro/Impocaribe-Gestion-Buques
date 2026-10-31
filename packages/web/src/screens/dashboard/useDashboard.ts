// T100 · P-06 Tablero (plan §7.3). RF-TAB-01, 04, HU-03: las cifras salen de la copia local, que trae los saldos que
// calculó el servidor. Sin filtro, con los totales de las DM; con un buque, con las asignaciones a ese buque.
// «Requieren atención»: las DM con alguna alerta abierta AL-01, AL-03 o AL-04.
import {
  addTons,
  can,
  DEADLINE_WARNING_DAY,
  deadlineAt,
  declarationStage,
  formatTons,
  parseTons,
  stageText,
  subTons,
  ZERO_TONS,
  type Stage,
  type Tons,
} from '@impocaribe/shared';
import type { ClientDto, DeclarationDto, DraftDto, OrderDto, VesselDto } from '@impocaribe/shared/validation';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAppSession } from '../../session/SessionProvider';
import { useLocalList, useRecentlyChanged, useServerNow } from '../../sync/SyncProvider';
import { useAlerts } from '../alerts/useAlerts';
import { useLocalDraftCount } from '../alerts/useAlertFeed';
import { byText, useLocal } from '../catalogs/useCatalog';

const ATTENTION = new Set(['AL-01', 'AL-03', 'AL-04']);

export interface DashboardRow {
  id: string;
  number: string;
  clientBrand: string;
  total: Tons | null;
  loaded: Tons;
  /** Lo que falta cargar (null sin total). */
  pending: Tons | null;
  /** 0 a 100. */
  progress: number;
  orders: number;
  stage: Stage;
  stageText: string;
  tone: 'ok' | 'warn' | 'bad' | 'info' | 'mute';
  day: number;
}

const t = (s: string) => parseTons(s);
const sum = (xs: Tons[]) => addTons(ZERO_TONS, ...xs);
const pct = (loaded: Tons, total: Tons | null) =>
  total && !total.isZero() ? Math.round(loaded.div(total).times(1000).toNumber()) / 10 : 0;

export function useDashboard() {
  const { state } = useAppSession();
  const role = state.session!.user.role;
  const navigate = useNavigate();
  const now = useServerNow()();
  const alerts = useAlerts();
  const localDrafts = useLocalDraftCount();
  const changed = useRecentlyChanged('declaration');
  const { data: declarations } = useLocalList<DeclarationDto>('declaration');
  const { data: orders } = useLocalList<OrderDto>('order');
  const { data: drafts } = useLocalList<DraftDto>('draft');
  const vessels = useLocal<VesselDto>(
    'vessel',
    byText((v) => v.name),
  );
  const clients = useLocal<ClientDto>(
    'client',
    byText((c) => c.name),
  );
  const [vesselId, setVesselId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const inScope = (orders ?? []).filter((o) => !vesselId || o.vesselId === vesselId);
  const rows: DashboardRow[] = (declarations ?? []).flatMap((d) => {
    const a = vesselId ? d.allocations.find((x) => x.vesselId === vesselId) : undefined;
    if (vesselId && !a) return [];
    const total = a ? t(a.allocatedTons) : d.totalTons === null ? null : t(d.totalTons);
    const loaded = t(a ? a.loadedTons : d.loadedTons);
    const deadline = deadlineAt(d.deadlineStartDate, now);
    const stage = declarationStage({
      total: d.totalTons === null ? null : t(d.totalTons),
      allocations: d.allocations.map((x) => ({ allocated: t(x.allocatedTons), loaded: t(x.loadedTons) })),
      expired: d.expiredAt !== null || deadline.expired,
    });
    return [
      {
        id: d.id,
        number: d.number,
        clientBrand: `${clientName.get(d.clientId) ?? ''} · ${d.brand}`,
        total,
        loaded,
        pending: total === null ? null : subTons(total, loaded),
        progress: pct(loaded, total),
        orders: inScope.filter((o) => o.declarationId === d.id && o.status === 'official').length,
        stage: stage.stage,
        stageText:
          stage.stage !== 'delivered' && !stage.expired && deadline.day >= DEADLINE_WARNING_DAY
            ? `${stageText(stage)} · día ${deadline.day}`
            : stageText(stage),
        tone: stage.expired
          ? 'bad'
          : stage.stage === 'delivered'
            ? 'ok'
            : deadline.day >= DEADLINE_WARNING_DAY
              ? 'warn'
              : stage.stage === 'pending'
                ? 'mute'
                : 'info',
        day: deadline.day,
      },
    ];
  });
  rows.sort((a, b) => b.number.localeCompare(a.number));

  const contracted = sum(rows.flatMap((r) => (r.total ? [r.total] : [])));
  const extracted = sum(rows.map((r) => r.loaded));
  const attention = new Set(
    alerts.server
      .filter((x) => x.status === 'open' && ATTENTION.has(x.type) && x.entityType === 'declaration')
      .map((x) => x.entityId),
  );
  const editor = can(role, 'orders.issue');

  return {
    loading: declarations === undefined || orders === undefined,
    vesselId,
    setVesselId,
    vesselOptions: [{ value: '', label: 'Todos los buques' }, ...vessels.map((v) => ({ value: v.id, label: v.name }))],
    stats: {
      contracted: formatTons(contracted),
      extracted: formatTons(extracted),
      pending: formatTons(subTons(contracted, extracted)),
      contractedTons: contracted.toNumber(),
      extractedTons: extracted.toNumber(),
      pendingTons: subTons(contracted, extracted).toNumber(),
      dms: rows.length,
      official: inScope.filter((o) => o.status === 'official').length,
      voided: inScope.filter((o) => o.status === 'voided').length,
      /** Solo A y O tienen borradores. */
      drafts: editor ? (drafts ?? []).length + localDrafts : null,
      attention: rows.filter((r) => attention.has(r.id)).length,
    },
    rows,
    changed,
    alerts,
    selected: rows.find((r) => r.id === selectedId) ?? rows[0] ?? null,
    select: (r: DashboardRow) => setSelectedId(r.id),
    openDeclaration: (r: DashboardRow) => navigate(`/dm/${r.id}`),
    newOrder: editor ? (r?: DashboardRow) => navigate(r ? `/ordenes/nueva?dm=${r.id}` : '/ordenes/nueva') : null,
  };
}

export type DashboardModel = ReturnType<typeof useDashboard>;
