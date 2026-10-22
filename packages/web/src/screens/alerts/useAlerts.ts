// T096 · P-17 Alertas (plan §7.3). RF-ALR-03 a 05: filtros por estado, tipo y DM o buque; abrir el origen; atender las
// de evento según la tabla AL. Las del servidor salen de la copia local; atender va al servidor.
import { ALERTS, attendsAlert, type AlertType } from '@impocaribe/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { alertsApi } from '../../api/endpoints/alerts';
import { useAppSession } from '../../session/SessionProvider';
import { useRecentlyChanged, useServerNow } from '../../sync/SyncProvider';
import { useCatalog } from '../catalogs/useCatalog';
import { useAlertFeed, type AlertRow } from './useAlertFeed';

export type StatusFilter = 'open' | 'attended' | 'resolved' | 'all';
export const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'open', label: 'Abiertas' },
  { id: 'attended', label: 'Atendidas' },
  { id: 'resolved', label: 'Resueltas' },
  { id: 'all', label: 'Todas' },
];

const ORIGIN: Record<string, { label: string; path: (id: string | null) => string }> = {
  declaration: { label: 'Abrir la DM', path: (id) => `/dm/${id}` },
  order: { label: 'Abrir la orden', path: (id) => `/ordenes/${id}` },
  vessel: { label: 'Abrir el buque', path: (id) => `/buques/${id}` },
  draft: { label: 'Ver borradores', path: () => '/borradores' },
};

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Havana' });
const TIME = new Intl.DateTimeFormat('es-CU', {
  timeZone: 'America/Havana',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const SHORT = new Intl.DateTimeFormat('es-CU', { timeZone: 'America/Havana', day: '2-digit', month: '2-digit' });

/** «hace 5 min», «hoy 09:40», «ayer 15:12» o «12/10 08:30», con la hora del servidor. */
export function ageText(iso: string, now: Date): string {
  const at = new Date(iso);
  const min = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const day = DAY.format(at);
  if (day === DAY.format(now)) return `hoy ${TIME.format(at)}`;
  if (day === DAY.format(new Date(now.getTime() - 86_400_000))) return `ayer ${TIME.format(at)}`;
  return `${SHORT.format(at)} ${TIME.format(at)}`;
}

export function useAlerts({ onLeave }: { onLeave?: () => void } = {}) {
  const base = useCatalog();
  const feed = useAlertFeed();
  const { state } = useAppSession();
  const role = state.session!.user.role;
  const navigate = useNavigate();
  const now = useServerNow()();
  const changed = useRecentlyChanged('alert');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [type, setType] = useState('');
  const [text, setText] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const match = (a: AlertRow) =>
    (status === 'all' || a.status === status) &&
    (!type || a.type === type) &&
    (!text.trim() || fold(`${a.title} ${a.detail}`).includes(fold(text.trim())));
  const locals = feed.locals.filter(match);
  const server = feed.server.filter(match);
  const all = [...locals, ...server];
  const types = [...new Set([...feed.locals, ...feed.server].map((a) => a.type))].sort();

  const go = (path: string) => {
    onLeave?.();
    void navigate(path);
  };

  return {
    ...base,
    loading: feed.loading,
    locals,
    server,
    open: feed.open,
    status,
    setStatus,
    type,
    setType,
    typeOptions: [
      { value: '', label: 'Todos los tipos' },
      ...types.map((t) => ({ value: t, label: `${ALERTS[t].label} (${t})` })),
    ],
    text,
    setText,
    selected: all.find((a) => a.id === selectedId) ?? all[0] ?? null,
    select: (a: AlertRow) => setSelectedId(a.id),
    /** MOV-02: llegó o cambió hace un momento. */
    isNew: (a: AlertRow) => changed.has(a.id),
    age: (a: AlertRow) => (a.createdAt ? ageText(a.createdAt, now) : 'ahora'),
    origin: (a: AlertRow) => {
      const o = a.entityType ? ORIGIN[a.entityType] : undefined;
      return o ? { label: o.label, open: () => go(o.path(a.entityId)) } : null;
    },
    canAttend: (a: AlertRow) => a.kind === 'event' && a.status === 'open' && attendsAlert(a.type as AlertType, role),
    attend: (a: AlertRow) =>
      void base.act(`atender-${a.id}`, async () => {
        await base.api().request(alertsApi.attend, { params: { id: a.id } });
        await base.done(`Se atendió la alerta «${a.title}».`);
      }),
    seeAll: () => go('/alertas'),
  };
}

export type AlertsModel = ReturnType<typeof useAlerts>;
