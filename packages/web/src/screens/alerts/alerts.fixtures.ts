// T096 · Alertas ficticias para las pruebas y las historias de P-17. La hora de las pruebas es el 14/10/2026 16:40 UTC.
import type { AlertDto } from '@impocaribe/shared/validation';
import { id } from '../orders/orders.fixtures';

export const DM_ID = id(50);

export const alert = (n: number, extra: Partial<AlertDto> = {}): AlertDto => ({
  id: id(60 + n),
  type: 'AL-03',
  kind: 'condition',
  title: 'DM 00437 en el día 25 del plazo',
  detail: 'Al empezar el día 31 vence y lo no cargado vuelve libre a su buque.',
  entityType: 'declaration',
  entityId: DM_ID,
  targetUserId: null,
  status: 'open',
  createdAt: '2026-10-14T04:00:00.000Z',
  resolvedAt: null,
  attendedByName: null,
  attendedAt: null,
  ...extra,
});

export const OVERDRAFT = alert(1, {
  type: 'AL-05',
  kind: 'event',
  title: 'Sobregiro bloqueado en la DM 00431',
  detail: 'Mario Delgado intentó emitir una orden: esta orden pasa el saldo por 0,280 t.',
  createdAt: '2026-10-14T16:39:00.000Z',
});
export const PENDING = alert(2, {
  type: 'AL-02',
  kind: 'event',
  title: 'DM 00440 registrada con 2 pendientes',
  detail: 'Pendientes: 00437, 00439.',
  createdAt: '2026-10-13T19:12:00.000Z',
});
export const DAY25 = alert(3);
export const EXPIRED = alert(4, {
  type: 'AL-04',
  kind: 'event',
  title: 'DM 00431 vencida',
  detail: 'Se desactivó al empezar el día 31.',
  status: 'attended',
  attendedByName: 'Ilén Fernández Rojas',
  attendedAt: '2026-10-11T12:30:00.000Z',
  createdAt: '2026-10-11T04:05:00.000Z',
});

export const ALL_ALERTS = [OVERDRAFT, PENDING, DAY25, EXPIRED];
export const asLocal = (list: AlertDto[]) =>
  list.map((a) => ({ entityType: 'alert' as const, entityId: a.id, payload: a }));
