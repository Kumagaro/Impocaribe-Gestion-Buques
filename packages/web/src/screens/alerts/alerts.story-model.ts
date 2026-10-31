// T096 · El modelo fijo de P-17 para las historias (alertas y tablero): sin servidor. Datos ficticios.
import { ALERTS, type AlertType } from '@impocaribe/shared';
import { asyncNoop, noop } from '../story-helpers';
import { ALL_ALERTS } from './alerts.fixtures';
import { fromServer, type AlertRow } from './useAlertFeed';
import { ageText, type AlertsModel } from './useAlerts';

const NOW = new Date('2026-10-14T16:40:00.000Z');
export const DRAFTS: AlertRow = {
  id: 'local-AL-14',
  type: 'AL-14',
  kind: 'local',
  title: '2 borradores sin subir',
  detail: 'Se suben como privados en cuanto vuelva la conexión.',
  status: 'open',
  createdAt: null,
  attendedByName: null,
  attendedAt: null,
  entityType: 'draft',
  entityId: null,
};
export const OFFLINE: AlertRow = {
  ...DRAFTS,
  id: 'local-AL-13',
  type: 'AL-13',
  title: 'Sin conexión con el servidor',
  detail: 'Datos al 14/10/2026 12:20. Lo que escriba queda como borrador en este dispositivo.',
  entityType: null,
};
const server = ALL_ALERTS.map(fromServer);
const open = server.filter((a) => a.status === 'open');

export const alertsStoryModel = (extra: Partial<AlertsModel> = {}): AlertsModel => {
  const m: AlertsModel = {
    api: () => {
      throw new Error('Sin servidor en las historias');
    },
    canEdit: true,
    offlineReason: undefined,
    notice: null,
    setNotice: noop,
    busy: null,
    done: asyncNoop,
    act: asyncNoop,
    loading: false,
    locals: [DRAFTS],
    server: open,
    open: open.length + 1,
    status: 'open',
    setStatus: noop,
    type: '',
    setType: noop,
    typeOptions: [
      { value: '', label: 'Todos los tipos' },
      ...[...new Set(server.map((a) => a.type))].map((t) => ({
        value: t,
        label: `${ALERTS[t as AlertType].label} (${t})`,
      })),
    ],
    text: '',
    setText: noop,
    selected: open[0] ?? null,
    select: noop,
    isNew: (a) => a.type === 'AL-05',
    age: (a) => (a.createdAt ? ageText(a.createdAt, NOW) : 'ahora'),
    origin: (a) =>
      a.entityType === 'declaration'
        ? { label: 'Abrir la DM', open: noop }
        : a.entityType === 'draft'
          ? { label: 'Ver borradores', open: noop }
          : null,
    canAttend: (a) => a.kind === 'event' && a.status === 'open',
    attend: noop,
    seeAll: noop,
    ...extra,
  };
  return m;
};
