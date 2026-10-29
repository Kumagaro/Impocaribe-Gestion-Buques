import type { DeclarationDto } from '@impocaribe/shared/validation';
import { userDtoSchema } from '@impocaribe/shared/validation';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { archiveApi } from '../../api/endpoints/consultas';
import { declarationsApi } from '../../api/endpoints/vessels';
import type { StoredSession } from '../../session/app-session';
import { DM, id, local, ME, ORDER } from '../orders/orders.fixtures';
import { SearchScreen } from './Search.screen';
import { declarationMatches, orderMatches } from './useSearch';

// T101 · P-12 Buscar (ui-spec P-12 y maqueta T099): el hook real, la copia local y el servidor falso para el archivo.
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
const order = (n: number, number: string) => ({ ...ORDER, id: id(n), number });
const ORDERS = [
  order(30, 'EAGLE1-2026-V2-0042'),
  order(31, 'OCEANPRIDE-2026-V1-0042'),
  order(32, 'EAGLE1-2026-V2-0420'),
];
const records = () => local(...ORDERS.map((o) => ({ entityType: 'order' as const, entityId: o.id, payload: o })));
const OLD: DeclarationDto = { ...DM, id: id(60), number: '00102', deadlineStartDate: '2025-05-02' };
const groups = () => screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));

describe('P-12 Buscar', () => {
  it('«42» encuentra las órdenes que terminan en 0042, en todos los buques (HU-10)', async () => {
    const t = await renderScreen(<SearchScreen />, {
      path: '/buscar?q=42',
      route: '/buscar',
      session: session('operador'),
      local: records(),
      otherRoutes: ['/ordenes/:id'],
    });
    const orders = await screen.findByRole('region', { name: 'Órdenes · 2' });
    expect(
      within(orders)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual(['EAGLE1-2026-V2-0042', 'OCEANPRIDE-2026-V1-0042']);
    await userEvent.click(within(orders).getByRole('button', { name: /^EAGLE1-2026-V2-0042/ }));
    expect(t.router.state.location.pathname).toBe(`/ordenes/${id(30)}`);
  });

  // RF-TAB-02: por cada DM, saldo, asignaciones por buque, progreso, plazo y sus órdenes con su estado.
  it('por cliente o marca aparece la DM; su ficha con etapas, asignaciones, órdenes y el seguimiento en PDF', async () => {
    const t = await renderScreen(<SearchScreen />, {
      path: '/buscar',
      session: session('operador'),
      local: records(),
      otherRoutes: ['/ordenes/nueva'],
      before: (s) =>
        s.respond(declarationsApi.tracking, {
          fileName: 'seguimiento-DM-00431.pdf',
          mime: 'application/pdf',
          base64: 'JVBERg==',
        }),
    });
    for (const text of ['Nuevos Tiempos', 'dosel', '00431']) {
      await userEvent.clear(await screen.findByLabelText('Buscar'));
      await userEvent.type(screen.getByLabelText('Buscar'), text);
      expect(groups()).toContain('DM · 1');
    }
    await userEvent.click(screen.getByRole('button', { name: /^00431/ }));
    const ficha = screen.getByRole('region', { name: 'Ficha de la DM 00431' });
    expect(within(ficha).getByRole('listitem', { current: 'step' }).textContent).toBe('En extracción');
    expect(ficha.textContent).toContain('asignado 100,000 t · cargado 17,280 t · saldo 82,720 t');
    expect(within(ficha).getByRole('list', { name: 'Órdenes de la DM' }).children).toHaveLength(3);
    // D7: el plazo cuenta desde el 02/10 (día 1); hoy es el 14/10.
    expect(within(ficha).getByText('Plazo').nextElementSibling!.textContent).toBe('día 13 de 30');
    expect(within(within(ficha).getByRole('list', { name: 'Órdenes de la DM' })).getAllByText('Oficial')).toHaveLength(
      3,
    );
    await userEvent.click(within(ficha).getByRole('button', { name: 'Descargar el seguimiento (PDF)' }));
    expect(await screen.findByText('Se descargó el seguimiento de la DM 00431.')).not.toBeNull();
    expect(t.platform.calls.filter((c) => c.method === 'saveFile')).toHaveLength(1);
    await userEvent.click(within(ficha).getByRole('button', { name: 'Nueva orden para esta DM' }));
    expect(`${t.router.state.location.pathname}${t.router.state.location.search}`).toBe(`/ordenes/nueva?dm=${DM.id}`);
  });

  it('«Buscar en el archivo» consulta al servidor lo de más de 12 meses', async () => {
    const t = await renderScreen(<SearchScreen />, {
      path: '/buscar?q=102',
      route: '/buscar',
      session: session('lectura'),
      local: records(),
      before: (s) => {
        s.respond(archiveApi.declarations, [OLD]);
        s.respond(archiveApi.orders, []);
      },
    });
    expect(await screen.findByText('En este dispositivo no hay nada con «102».')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Buscar en el archivo' }));
    const archived = await screen.findByRole('region', { name: 'DM del archivo · 1' });
    expect(t.server.calls.find((c) => c.path === '/archive/declarations')!.query.get('q')).toBe('102');
    await userEvent.click(within(archived).getByRole('button', { name: /^00102/ }));
    const ficha = screen.getByRole('region', { name: 'Ficha de la DM 00102' });
    expect(ficha.textContent).toContain('Del archivo: más de 12 meses, no está en este dispositivo.');
    expect(within(ficha).queryByRole('button', { name: 'Nueva orden para esta DM' })).toBeNull();
  });

  it('sin conexión, el archivo explica por qué no se puede', async () => {
    await renderScreen(<SearchScreen />, {
      path: '/buscar?q=zzz',
      route: '/buscar',
      session: session('operador'),
      local: records(),
      online: false,
    });
    expect(await screen.findByText(/sin conexión no se puede buscar en el archivo/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Buscar en el archivo' })).toBeNull();
  });
});

describe('qué coincide (RF-TAB-03)', () => {
  it.each([
    ['EAGLE1-2026-V1-0042', '42', true],
    ['EAGLE1-2026-V1-0042', '0042', true],
    ['EAGLE1-2026-V1-0042', 'eagle1-2026-v1-0042', true],
    ['EAGLE1-2026-V1-0420', '42', false],
    ['EAGLE1-2026-V1-0042', '2026', false],
    ['EAGLE1-2026-V1-0042', '', false],
  ])('orden %s con «%s»: %s', (number, q, ok) => {
    expect(orderMatches(number, q)).toBe(ok);
  });

  it.each([
    ['431', true],
    ['00431', true],
    ['nuevos tiempos', true],
    ['DOSÉL', true],
    ['Delicia', false],
    ['  ', false],
  ])('DM 00431 de Nuevos Tiempos (Dosel) con «%s»: %s', (q, ok) => {
    expect(declarationMatches({ number: '00431', brand: 'Dosel' }, 'Nuevos Tiempos S.R.L.', q)).toBe(ok);
  });
});
