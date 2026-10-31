import { userDtoSchema } from '@impocaribe/shared/validation';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { draftsApi, ordersApi } from '../../api/endpoints/orders';
import type { StoredSession } from '../../session/app-session';
import { CorrectOrderScreen } from './CorrectOrder.screen';
import { DraftsScreen } from './Drafts.screen';
import { OrderScreen } from './Order.screen';
import { draft, DM, id, local, ME, ORDER, version } from './orders.fixtures';

// T087 a T089 · P-14 Borradores, P-15 Orden y P-16 Corregir y Anular (ui-spec y maqueta T085): el hook real, la copia
// local real y las tres presentaciones. La hora de las pruebas es el 14/10/2026 a las 16:40 UTC (FIXED_TIME).
vi.setConfig({ testTimeout: 40_000 });

const session = (role: 'apoderada' | 'operador' | 'lectura', userId = ME): StoredSession => ({
  token: 't',
  expiresAt: '2026-10-15T16:40:00.000Z',
  user: sampleOf(userDtoSchema, {
    id: userId,
    fullName: 'Mario Delgado',
    role,
    nationalId: '85020306548',
    phone: '52345678',
    mustChangePassword: false,
  }),
});
const REASON = 'Peso corregido en la báscula del puerto';
const withOrder = (o = ORDER) => local({ entityType: 'order', entityId: o.id, payload: o });

describe('P-15 Orden', () => {
  // RF-BIT-04: cada orden muestra su propio historial (las versiones con autor, cambios y motivo).
  it('el documento vigente, sus versiones con los cambios, y «Descargar el original» para quien la emitió', async () => {
    const v2 = version(2, { tons: '18.000', reason: REASON, issuedAt: '2026-10-14T15:00:00.000Z' });
    const order = { ...ORDER, current: v2, versions: [version(1, { status: 'replaced' }), v2] };
    await renderScreen(<OrderScreen />, {
      path: `/ordenes/${ORDER.id}`,
      route: '/ordenes/:id',
      session: session('operador'),
      local: withOrder(order),
    });
    const doc = await screen.findByRole('article', { name: 'Documento de la orden EAGLE1-2026-V2-0001' });
    expect(doc.textContent).toContain('Versión 2');
    const versions = screen.getByRole('region', { name: 'Versiones' });
    expect(versions.textContent).toContain('Versión 2 · vigente');
    expect(versions.textContent).toContain('Toneladas: 17,280 t → 18,000 t');
    expect(versions.textContent).toContain(`Motivo: ${REASON}`);
    expect(screen.getByRole('button', { name: 'Descargar el original' })).not.toBeNull();
  });

  // RF-CON-08 y P-15: la orden ya abierta se ve sin conexión, con su documento, desde la copia del dispositivo.
  it('sin conexión, la orden se ve con su documento desde la copia local', async () => {
    await renderScreen(<OrderScreen />, {
      path: `/ordenes/${ORDER.id}`,
      route: '/ordenes/:id',
      session: session('operador'),
      local: withOrder(),
      online: false,
    });
    const doc = await screen.findByRole('article', { name: 'Documento de la orden EAGLE1-2026-V2-0001' });
    expect(doc.textContent).toContain('Harina de trigo17.280');
  });

  it('para otro usuario, o pasadas 24 h, la descarga es una copia; Solo lectura no corrige ni anula', async () => {
    await renderScreen(<OrderScreen />, {
      path: `/ordenes/${ORDER.id}`,
      route: '/ordenes/:id',
      session: session('lectura', id(91)),
      local: withOrder(),
    });
    expect(await screen.findByRole('button', { name: 'Descargar una copia' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Anular' })).toBeNull();
  });

  it('anular pide motivo, dice cuánto repone y envía la versión vigente (RF-ORD-19)', async () => {
    const t = await renderScreen(<OrderScreen />, {
      path: `/ordenes/${ORDER.id}`,
      route: '/ordenes/:id',
      session: session('operador'),
      local: withOrder(),
      before: (s) => s.respond(ordersApi.void, { ...ORDER, status: 'voided' }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Anular' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anular EAGLE1-2026-V2-0001' });
    expect(dialog.textContent).toContain('Se repondrán 17,280 t al saldo de la DM 00431.');
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'El camión no se presentó');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anular' }));
    expect(await screen.findByText('Se anuló la orden EAGLE1-2026-V2-0001.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.path === `/orders/${ORDER.id}/void`)!.body).toEqual({
      reason: 'El camión no se presentó',
      expectedVersion: 1,
    });
  });

  it('una orden anulada lleva la marca y no ofrece corregir ni anular', async () => {
    const order = { ...ORDER, status: 'voided' as const };
    await renderScreen(<OrderScreen />, {
      path: `/ordenes/${ORDER.id}`,
      route: '/ordenes/:id',
      session: session('operador'),
      local: withOrder(order),
    });
    expect((await screen.findByRole('article')).textContent).toContain('ANULADA');
    expect(screen.queryByRole('button', { name: 'Corregir' })).toBeNull();
  });
});

describe('P-16 Corregir', () => {
  it('DM y buque fijos, los cambios resaltados, el motivo obligatorio y la versión que vio', async () => {
    const t = await renderScreen(<CorrectOrderScreen />, {
      path: `/ordenes/${ORDER.id}/corregir`,
      route: '/ordenes/:id/corregir',
      session: session('operador'),
      local: withOrder(),
      otherRoutes: ['/ordenes/:id'],
      before: (s) => s.respond(ordersApi.correct, { ...ORDER, current: version(2, { tons: '18.000' }) }),
    });
    expect(await screen.findByText(/DM 00431 · buque Eagle 1 · no cambian/)).not.toBeNull();
    const tons = await screen.findByLabelText('Toneladas');
    await userEvent.clear(tons);
    await userEvent.type(tons, '18');
    expect(await screen.findByText(/Cambios frente a la versión 1: Toneladas: 17,280 t → 18,000 t/)).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Emitir la versión 2' }));
    expect(
      (await screen.findAllByText('Escriba el motivo: es obligatorio y queda en la bitácora.')).length,
    ).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText('Motivo'), REASON);
    await userEvent.click(screen.getByRole('button', { name: 'Emitir la versión 2' }));
    expect(await screen.findByText('Pantalla /ordenes/:id')).not.toBeNull();
    const body = t.server.calls.find((c) => c.path === `/orders/${ORDER.id}/corrections`)!.body as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({ tons: '18.000', reason: REASON, expectedVersion: 1 });
    expect('declarationId' in body).toBe(false);
  });
});

describe('P-14 Borradores', () => {
  it('Míos (de este dispositivo y privados) y Compartidos, con quién lo tiene abierto', async () => {
    const t = await renderScreen(<DraftsScreen />, {
      path: '/borradores',
      session: session('apoderada'),
      local: local(
        { entityType: 'draft', entityId: id(30), payload: draft(30, { visibility: 'private' }) },
        {
          entityType: 'draft',
          entityId: id(32),
          payload: draft(32, {
            ownerName: 'Ilén Fernández',
            ownerId: id(91),
            lockedById: id(91),
            lockedByName: 'Ilén Fernández',
            lockExpiresAt: '2026-10-14T16:45:00.000Z',
          }),
        },
      ),
    });
    await (await t.session.localStore()).saveLocalDraft(id(40), { declarationId: DM.id }, '2026-10-14T16:00:00.000Z');
    const mine = await screen.findByRole('list', { name: 'Míos' });
    expect(await within(mine).findByText('Solo en este dispositivo')).not.toBeNull();
    expect(within(mine).getAllByRole('listitem')).toHaveLength(2);
    const shared = screen.getByRole('list', { name: 'Compartidos' });
    expect(shared.textContent).toContain('En edición por Ilén Fernández');
    expect(within(shared).getByRole('button', { name: 'Liberar' })).not.toBeNull();
  });

  it('compartir uno de este dispositivo lo sube como compartido y lo quita de aquí', async () => {
    const t = await renderScreen(<DraftsScreen />, {
      path: '/borradores',
      session: session('operador'),
      local: local(),
      before: (s) => s.respond(draftsApi.save, draft(41)),
    });
    await (await t.session.localStore()).saveLocalDraft(id(40), { declarationId: DM.id }, '2026-10-14T16:00:00.000Z');
    await userEvent.click(await screen.findByRole('button', { name: 'Compartir' }));
    expect(await screen.findByText('Se compartió el borrador.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.path === '/drafts')!.body).toEqual({
      clientDraftId: id(40),
      visibility: 'shared',
      payload: { declarationId: DM.id },
    });
    expect(await (await t.session.localStore()).localDrafts()).toEqual([]);
  });
});
