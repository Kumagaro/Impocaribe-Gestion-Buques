import type { OrderDto } from '@impocaribe/shared/validation';
import { userDtoSchema } from '@impocaribe/shared/validation';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { ordersApi } from '../../api/endpoints/orders';
import type { StoredSession } from '../../session/app-session';
import { OrderListScreen } from './OrderList.screen';
import { DRIVER, id, local, ME, ORDER, SNAPSHOT, version } from './orders.fixtures';
import { weekOf } from './useOrderList';

// T102 · P-32 Órdenes (ui-spec P-32 y maqueta T099): el hook real y la copia local. Hoy es miércoles 14/10/2026.
vi.setConfig({ testTimeout: 40_000 });

const session: StoredSession = {
  token: 't',
  expiresAt: '2026-10-15T16:40:00.000Z',
  user: sampleOf(userDtoSchema, {
    id: ME,
    fullName: 'Mario Delgado',
    role: 'operador',
    nationalId: '85020306548',
    phone: '52345678',
    mustChangePassword: false,
  }),
};
const OTHER_DRIVER = { ...DRIVER, id: id(47), fullName: 'Pedro Pérez Castillo', nationalId: '90051212345' };
const order = (
  n: number,
  number: string,
  extra: Parameters<typeof version>[1],
  status: OrderDto['status'] = 'official',
) => {
  const v = version(1, {
    ...extra,
    snapshot: { ...SNAPSHOT, number, driverName: extra?.driverId ? OTHER_DRIVER.fullName : SNAPSHOT.driverName },
  });
  return { ...ORDER, id: id(n), number, status, current: v, versions: [v] };
};
const YESTERDAY = order(31, 'EAGLE1-2026-V2-0002', { loadingDate: '2026-10-13', tons: '10.000' }, 'voided');
const LAST_WEEK = order(32, 'EAGLE1-2026-V2-0003', {
  loadingDate: '2026-10-05',
  tons: '25.500',
  driverId: OTHER_DRIVER.id,
});
const ORDERS = [ORDER, YESTERDAY, LAST_WEEK];
const withOrders = () => [
  ...local(...ORDERS.map((o) => ({ entityType: 'order' as const, entityId: o.id, payload: o }))),
  { entityType: 'driver' as const, entityId: OTHER_DRIVER.id, payload: OTHER_DRIVER },
];
const names = (list = screen.getByRole('table', { name: 'Órdenes' })) =>
  within(list)
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.textContent?.match(/EAGLE1-2026-V2-\d{4}/)?.[0]);
const totals = () => screen.getByRole('status', { name: 'Totales del rango' }).textContent;

describe('P-32 Órdenes', () => {
  it('«Hoy» por defecto, con la cantidad y el total; «Esta semana» suma solo las oficiales', async () => {
    await renderScreen(<OrderListScreen />, { path: '/ordenes', session, local: withOrders() });
    await screen.findByRole('table', { name: 'Órdenes' });
    expect(names()).toEqual([ORDER.number]);
    expect(totals()).toBe('1orden17,280 t');
    await userEvent.click(screen.getByRole('button', { name: 'Esta semana' }));
    expect(names()).toEqual([ORDER.number, YESTERDAY.number]);
    expect(totals()).toBe('2órdenes17,280 t(1 anulada, que no suma)');
  });

  it('un rango y el chofer: solo sus órdenes, igual que la base (HU-17)', async () => {
    await renderScreen(<OrderListScreen />, { path: '/ordenes', session, local: withOrders() });
    await screen.findByRole('table', { name: 'Órdenes' });
    await userEvent.click(screen.getByRole('button', { name: 'Rango' }));
    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-01');
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-10-31');
    expect(names()).toEqual([ORDER.number, YESTERDAY.number, LAST_WEEK.number]);
    await userEvent.selectOptions(screen.getByLabelText('Chofer'), OTHER_DRIVER.id);
    expect(names()).toEqual([LAST_WEEK.number]);
    expect(totals()).toBe('1orden25,500 t');
    await userEvent.selectOptions(screen.getByLabelText('Chofer'), '');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'voided');
    expect(names()).toEqual([YESTERDAY.number]);
  });

  it('la orden elegida se ve al lado; se abre y se descarga su PDF', async () => {
    const t = await renderScreen(<OrderListScreen />, {
      path: '/ordenes',
      session,
      local: withOrders(),
      otherRoutes: ['/ordenes/:id'],
      before: (s) =>
        s.respond(ordersApi.pdf, { kind: 'copy', fileName: 'x.pdf', mime: 'application/pdf', base64: 'JVBERg==' }),
    });
    const side = await screen.findByRole('complementary', { name: `Orden ${ORDER.number}` });
    await userEvent.click(within(side).getByRole('button', { name: 'Descargar PDF' }));
    expect(await screen.findByText(`Se descargó una copia de ${ORDER.number}.`)).not.toBeNull();
    expect(t.platform.calls.filter((c) => c.method === 'saveFile')).toHaveLength(1);
    await userEvent.click(within(side).getByRole('button', { name: 'Abrir la orden' }));
    expect(t.router.state.location.pathname).toBe(`/ordenes/${ORDER.id}`);
  });

  it('en teléfono, tarjetas agrupadas por fecha de carga', async () => {
    await renderScreen(<OrderListScreen />, { path: '/ordenes', device: 'phone', session, local: withOrders() });
    await userEvent.click(await screen.findByRole('button', { name: 'Esta semana' }));
    const days = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(days).toEqual(['Miércoles 14/10/2026', 'Martes 13/10/2026']);
  });
});

describe('semana de La Habana', () => {
  it.each([
    ['2026-10-14', '2026-10-12', '2026-10-18'],
    ['2026-10-12', '2026-10-12', '2026-10-18'],
    ['2026-10-18', '2026-10-12', '2026-10-18'],
    ['2027-01-01', '2026-12-28', '2027-01-03'],
  ])('%s: de %s a %s', (today, from, to) => {
    expect(weekOf(today)).toEqual({ from, to });
  });
});
