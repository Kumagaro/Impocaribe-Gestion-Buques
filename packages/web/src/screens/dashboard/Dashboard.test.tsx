import type { DeclarationDto, VesselDto } from '@impocaribe/shared/validation';
import { userDtoSchema } from '@impocaribe/shared/validation';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import type { StoredSession } from '../../session/app-session';
import { alert, asLocal } from '../alerts/alerts.fixtures';
import { DM, draft, id, local, ME, ORDER, VESSEL } from '../orders/orders.fixtures';
import { DashboardScreen } from './Dashboard.screen';

// T100 · P-06 Tablero (ui-spec P-06 y maqueta T099): el hook real y la copia local. Hoy es el 14/10/2026.
vi.setConfig({ testTimeout: 40_000 });

const session = (role: 'apoderada' | 'operador' | 'lectura'): StoredSession => ({
  token: 't',
  expiresAt: '2026-10-15T16:40:00.000Z',
  user: sampleOf(userDtoSchema, {
    id: ME,
    fullName: 'Mario Delgado',
    role,
    nationalId: '85020306548',
    phone: '52345678',
    mustChangePassword: false,
  }),
});
const OCEAN: VesselDto = { ...VESSEL, id: id(14), name: 'Ocean Pride', code: 'OCEANPRIDE' };
/** Sin total y en el día 25 (empezó el 20/09). */
const PENDING: DeclarationDto = {
  ...DM,
  id: id(12),
  number: '00437',
  totalTons: null,
  deadlineStartDate: '2026-09-20',
  allocatedTons: '0.000',
  loadedTons: '0.000',
  balanceTons: null,
  pendingAllocationTons: null,
  allocations: [],
};
const ASSIGNED: DeclarationDto = {
  ...DM,
  id: id(13),
  number: '00439',
  totalTons: '50.000',
  allocatedTons: '50.000',
  loadedTons: '0.000',
  balanceTons: '50.000',
  allocations: [
    {
      id: id(15),
      vesselId: OCEAN.id,
      allocatedTons: '50.000',
      loadedTons: '0.000',
      balanceTons: '50.000',
      rowVersion: 1,
    },
  ],
};
const records = () => [
  ...local(
    { entityType: 'order', entityId: ORDER.id, payload: ORDER },
    { entityType: 'draft', entityId: id(40), payload: draft(40) },
  ),
  { entityType: 'vessel' as const, entityId: OCEAN.id, payload: OCEAN },
  { entityType: 'declaration' as const, entityId: PENDING.id, payload: PENDING },
  { entityType: 'declaration' as const, entityId: ASSIGNED.id, payload: ASSIGNED },
  ...asLocal([
    alert(1, { type: 'AL-03', entityId: PENDING.id, title: 'DM 00437 en el día 25 del plazo' }),
    alert(2, { type: 'AL-01', entityId: PENDING.id, title: 'DM 00437 pendiente' }),
  ]),
];
const stat = (label: string) => screen.getByRole('group', { name: label }).textContent;
const rows = () =>
  within(screen.getByRole('table', { name: 'Avance por DM' }))
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.textContent);

describe('P-06 Tablero', () => {
  it('contratado, extraído y pendiente de las DM; órdenes, borradores y las que requieren atención', async () => {
    await renderScreen(<DashboardScreen />, { path: '/', session: session('operador'), local: records() });
    await screen.findByRole('table', { name: 'Avance por DM' });
    expect(stat('Contratado')).toBe('Contratado150,000 ten 3 DM');
    expect(stat('Extraído')).toBe('Extraído17,280 t');
    expect(stat('Pendiente')).toBe('Pendiente132,720 tpor cargar');
    expect(stat('Órdenes')).toBe('Órdenes11 borradores · 0 anuladas');
    expect(stat('Requieren atención')).toBe('Requieren atención1DM con alertas abiertas');
    expect(rows()).toEqual([
      expect.stringContaining('00439'),
      expect.stringContaining('00437'),
      expect.stringContaining('00431'),
    ]);
    expect(rows()[0]).toContain('Asignada');
    expect(rows()[1]).toContain('Pendiente · día 25');
    expect(rows()[2]).toContain('En extracción');
    expect(rows()[2]).toContain('17,3 %');
    const alerts = screen.getByRole('complementary', { name: 'Alertas de hoy' });
    expect(alerts.textContent).toContain('DM 00437 en el día 25 del plazo');
  });

  it('con un buque, las cifras son las de sus asignaciones', async () => {
    // Sin animación: la cifra salta al valor nuevo (MOV-03 reducido).
    await renderScreen(<DashboardScreen />, {
      path: '/',
      session: session('operador'),
      local: records(),
      reduceMotion: true,
    });
    await screen.findByRole('table', { name: 'Avance por DM' });
    await userEvent.selectOptions(screen.getByLabelText('Buque'), VESSEL.id);
    expect(stat('Contratado')).toBe('Contratado100,000 ten 1 DM');
    expect(stat('Pendiente')).toBe('Pendiente82,720 tpor cargar');
    expect(rows()).toEqual([expect.stringContaining('00431')]);
    await userEvent.selectOptions(screen.getByLabelText('Buque'), OCEAN.id);
    expect(stat('Extraído')).toBe('Extraído0,000 t');
    expect(stat('Órdenes')).toBe('Órdenes01 borradores · 0 anuladas');
  });

  it('tocar una DM abre su ficha; Solo lectura no tiene borradores ni Nueva orden', async () => {
    const t = await renderScreen(<DashboardScreen />, {
      path: '/',
      session: session('lectura'),
      local: records(),
      otherRoutes: ['/dm/:id'],
    });
    await screen.findByRole('table', { name: 'Avance por DM' });
    expect(stat('Órdenes')).toBe('Órdenes10 anuladas');
    expect(screen.queryByRole('button', { name: 'Nueva orden' })).toBeNull();
    await userEvent.click(screen.getByRole('row', { name: /00431/ }));
    expect(t.router.state.location.pathname).toBe(`/dm/${DM.id}`);
  });

  it('en tablet, la ficha de la DM con sus etapas y «Nueva orden para esta DM»', async () => {
    const t = await renderScreen(<DashboardScreen />, {
      path: '/',
      device: 'tablet',
      session: session('apoderada'),
      local: records(),
      otherRoutes: ['/ordenes/nueva'],
    });
    await userEvent.click(await screen.findByRole('button', { name: /^00431/ }));
    const ficha = screen.getByRole('region', { name: 'DM 00431' });
    expect(within(ficha).getByRole('listitem', { current: 'step' }).textContent).toBe('En extracción');
    await userEvent.click(within(ficha).getByRole('button', { name: 'Nueva orden para esta DM' }));
    expect(`${t.router.state.location.pathname}${t.router.state.location.search}`).toBe(`/ordenes/nueva?dm=${DM.id}`);
  });
});
