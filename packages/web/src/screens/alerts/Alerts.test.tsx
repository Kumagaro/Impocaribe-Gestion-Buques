import { userDtoSchema } from '@impocaribe/shared/validation';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { alertsApi } from '../../api/endpoints/alerts';
import type { StoredSession } from '../../session/app-session';
import { ME } from '../orders/orders.fixtures';
import { AlertsScreen } from './Alerts.screen';
import { ALL_ALERTS, asLocal, DAY25, DM_ID, EXPIRED, OVERDRAFT, PENDING } from './alerts.fixtures';
import { ageText } from './useAlerts';

// T096 y T097 · P-17 Alertas (ui-spec P-17 y maqueta T095): el hook real, la copia local real y las presentaciones.
vi.setConfig({ testTimeout: 40_000 });

const session = (role: 'apoderada' | 'operador' | 'lectura'): StoredSession => ({
  token: 't',
  expiresAt: '2026-10-15T16:40:00.000Z',
  user: sampleOf(userDtoSchema, {
    id: ME,
    fullName: 'Ilén Fernández Rojas',
    role,
    nationalId: '85020306548',
    phone: '52345678',
    mustChangePassword: false,
  }),
});
const titles = () =>
  within(screen.getByRole('list', { name: 'Alertas' }))
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('aria-label'));
const item = (title: string) => screen.getByRole('listitem', { name: title });

describe('P-17 Alertas', () => {
  it('las abiertas, de la más reciente a la más antigua; solo las de evento se atienden; abre el origen', async () => {
    const t = await renderScreen(<AlertsScreen />, {
      path: '/alertas',
      session: session('apoderada'),
      local: asLocal(ALL_ALERTS),
      otherRoutes: ['/dm/:id'],
      before: (s) => s.respond(alertsApi.attend, { ...OVERDRAFT, status: 'attended' }),
    });
    await screen.findByRole('list', { name: 'Alertas' });
    expect(titles()).toEqual([OVERDRAFT.title, DAY25.title, PENDING.title]);
    expect(within(item(DAY25.title)).queryByRole('button', { name: 'Atender' })).toBeNull();
    expect(item(DAY25.title).textContent).toContain('Se resuelve sola');
    expect(item(OVERDRAFT.title).textContent).toContain('hace 1 min');

    await userEvent.click(within(item(OVERDRAFT.title)).getByRole('button', { name: 'Atender' }));
    expect(await screen.findByText(`Se atendió la alerta «${OVERDRAFT.title}».`)).not.toBeNull();
    expect(t.server.calls.some((c) => c.path === `/alerts/${OVERDRAFT.id}/attend`)).toBe(true);

    await userEvent.click(within(item(DAY25.title)).getByRole('button', { name: 'Abrir la DM' }));
    expect(t.router.state.location.pathname).toBe(`/dm/${DM_ID}`);
  });

  it('filtra por estado, tipo y DM o buque (RF-ALR-04)', async () => {
    await renderScreen(<AlertsScreen />, {
      path: '/alertas',
      session: session('apoderada'),
      local: asLocal(ALL_ALERTS),
    });
    await screen.findByRole('list', { name: 'Alertas' });
    await userEvent.click(screen.getByRole('button', { name: 'Atendidas' }));
    expect(titles()).toEqual([EXPIRED.title]);
    expect(item(EXPIRED.title).textContent).toContain('Atendida por Ilén Fernández Rojas');
    await userEvent.click(screen.getByRole('button', { name: 'Todas' }));
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'AL-02');
    expect(titles()).toEqual([PENDING.title]);
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), '');
    await userEvent.type(screen.getByLabelText('DM o buque'), '00431');
    expect(titles()).toEqual([OVERDRAFT.title, EXPIRED.title]);
    await userEvent.clear(screen.getByLabelText('DM o buque'));
    await userEvent.type(screen.getByLabelText('DM o buque'), '99999');
    expect(screen.getByText('No hay alertas con estos filtros.')).not.toBeNull();
  });

  it('Solo lectura no atiende ni las que ve (tabla AL)', async () => {
    await renderScreen(<AlertsScreen />, {
      path: '/alertas',
      session: session('lectura'),
      local: asLocal([DAY25, { ...EXPIRED, status: 'open', attendedByName: null, attendedAt: null }]),
    });
    await screen.findByRole('list', { name: 'Alertas' });
    expect(titles()).toEqual([DAY25.title, EXPIRED.title]);
    expect(screen.queryByRole('button', { name: 'Atender' })).toBeNull();
  });

  it('sin conexión, la alerta local AL-13 va arriba, en «En este dispositivo» (T097)', async () => {
    await renderScreen(<AlertsScreen />, {
      path: '/alertas',
      session: session('operador'),
      local: asLocal([DAY25]),
      online: false,
    });
    await screen.findByRole('list', { name: 'Alertas' });
    expect(titles()).toEqual(['Sin conexión con el servidor', DAY25.title]);
    expect(screen.getByText('En este dispositivo')).not.toBeNull();
  });

  it('en tablet, la alerta elegida se ve al lado con su detalle', async () => {
    await renderScreen(<AlertsScreen />, {
      path: '/alertas',
      device: 'tablet',
      session: session('operador'),
      local: asLocal([PENDING, DAY25]),
    });
    await screen.findByRole('list', { name: 'Alertas' });
    const detail = screen.getByRole('region', { name: 'Detalle de la alerta' });
    expect(within(detail).getByRole('heading', { level: 3 }).textContent).toBe(DAY25.title);
    await userEvent.click(screen.getByRole('button', { name: PENDING.title }));
    expect(within(detail).getByRole('heading', { level: 3 }).textContent).toBe(PENDING.title);
    expect(within(detail).getByRole('button', { name: 'Atender' })).not.toBeNull();
  });
});

describe('antigüedad con la hora del servidor', () => {
  const now = new Date('2026-10-14T16:40:00.000Z'); // 12:40 en La Habana
  it.each([
    ['2026-10-14T16:39:40.000Z', 'ahora'],
    ['2026-10-14T16:35:00.000Z', 'hace 5 min'],
    ['2026-10-14T13:40:00.000Z', 'hoy 09:40'],
    ['2026-10-13T19:12:00.000Z', 'ayer 15:12'],
    ['2026-10-11T12:30:00.000Z', '11/10 08:30'],
  ])('%s → %s', (iso, text) => {
    expect(ageText(iso, now)).toBe(text);
  });
});
