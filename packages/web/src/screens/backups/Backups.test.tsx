import {
  userDtoSchema,
  type BackupDto,
  type BackupPasswordStatus,
  type LostOrderDto,
  type NumberingStatus,
} from '@impocaribe/shared/validation';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { createFakeServer, FakeCall } from '../../../test/fake-server';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { backupPasswordApi, backupsApi, lostOrdersApi, restoresApi } from '../../api/endpoints/backups';
import type { StoredSession } from '../../session/app-session';
import { id, ME } from '../orders/orders.fixtures';
import { BackupsScreen } from './Backups.screen';

// HU-12: respaldos manuales y restaurar uno desde la app (los automáticos, en backups.int.test.ts).
// T112 · P-24 Respaldos y restauración (maqueta T111): el hook real y el servidor falso.
vi.setConfig({ testTimeout: 40_000 });

const session: StoredSession = {
  token: 't',
  expiresAt: '2026-10-24T22:00:00.000Z',
  user: sampleOf(userDtoSchema, {
    id: ME,
    fullName: 'Ana Apoderada',
    role: 'apoderada',
    nationalId: '85020306548',
    phone: '52345678',
    mustChangePassword: false,
  }),
};
const PASSWORD = 'respaldo de prueba 2026';
const status = (extra: Partial<BackupPasswordStatus> = {}): BackupPasswordStatus => ({
  defined: true,
  setAt: '2026-07-01T14:00:00.000Z',
  confirmedAt: '2026-10-23T14:00:00.000Z',
  due: false,
  postponesLeft: 3,
  ...extra,
});
const backup = (n: number, extra: Partial<BackupDto> = {}): BackupDto => ({
  id: id(n),
  kind: 'daily',
  status: 'ok',
  startedAt: '2026-10-24T00:00:00.000Z',
  finishedAt: '2026-10-24T00:00:30.000Z',
  available: true,
  sizeBytes: 50_226_381,
  sha256: 'a'.repeat(64),
  error: null,
  externalPath: 'E:/Respaldos',
  externalCopiedAt: '2026-10-24T00:00:40.000Z',
  createdByName: null,
  ...extra,
});
const lost = (n: number, extra: Partial<LostOrderDto> = {}): LostOrderDto => ({
  id: id(20 + n),
  restoreId: id(19),
  number: `EAGLE1-2026-V1-000${n}`,
  declarationNumber: '00431',
  clientName: 'Nuevos Tiempos S.R.L.',
  truckPlate: 'W011612',
  tons: '60.000',
  loadingDate: '2026-10-23',
  issuedAt: '2026-10-23T14:40:00.000Z',
  issuedByName: 'Mario Delgado',
  orderStatus: 'official',
  status: 'pending',
  lastError: null,
  discardReason: null,
  resolvedByName: null,
  resolvedAt: null,
  ...extra,
});
const NO_NUMBERING: NumberingStatus = { required: false, vessels: [] };

type Server = ReturnType<typeof createFakeServer>;
function serve(
  s: Server,
  o: { status?: BackupPasswordStatus; backups?: BackupDto[]; lost?: LostOrderDto[]; numbering?: NumberingStatus } = {},
) {
  s.respond(backupPasswordApi.status, o.status ?? status());
  s.respond(backupsApi.list, o.backups ?? [backup(1)]);
  s.respond(lostOrdersApi.list, o.lost ?? []);
  s.respond(restoresApi.numbering, o.numbering ?? NO_NUMBERING);
}
const posts = (t: { server: { calls: FakeCall[] } }, path: string) =>
  t.server.calls.filter((c) => c.method !== 'GET' && c.path === path);

describe('P-24 Respaldos y restauración', () => {
  it('el estado, la lista y las órdenes perdidas: una se recupera y otra se descarta con motivo', async () => {
    const t = await renderScreen(<BackupsScreen />, {
      path: '/respaldos',
      session,
      before: (s) => {
        serve(s, {
          backups: [
            backup(1),
            backup(2, {
              status: 'failed',
              kind: 'hourly',
              startedAt: '2026-10-23T20:00:00.000Z',
              error: 'pg_dump: sin espacio en disco',
              sizeBytes: null,
            }),
            backup(3, {
              kind: 'hourly',
              startedAt: '2026-10-21T15:00:00.000Z',
              available: false,
              externalPath: null,
              externalCopiedAt: null,
            }),
          ],
          lost: [lost(2), lost(3, { lastError: 'No alcanza el saldo: quedan 25,000 t en la asignación.' })],
        });
        s.respond(lostOrdersApi.recover, lost(2, { status: 'recovered' }));
        s.respond(lostOrdersApi.discard, lost(3, { status: 'discarded' }));
      },
    });
    expect(await screen.findByRole('heading', { name: 'Órdenes perdidas en la restauración · 2 pendientes' }));
    expect(screen.getByRole('group', { name: 'Contraseña de respaldo' }).textContent).toContain(
      'Confirmada el 23/10/2026',
    );
    expect(screen.getByRole('group', { name: 'Diario' }).textContent).toContain('Copiado a E:/Respaldos');

    const daily = screen.getByRole('row', { name: /^Diario/ });
    expect(daily.textContent).toContain('47,9 MB');
    expect(within(daily).getByRole('button').getAttribute('aria-label')).toBe(
      'Restaurar el respaldo del 23/10/2026 20:00',
    );
    const failed = screen.getByRole('row', { name: 'Por hora 23/10 16:00' });
    expect(failed.textContent).toContain('pg_dump: sin espacio en disco');
    expect(within(failed).queryByRole('button')).toBeNull();
    expect(screen.getByRole('row', { name: 'Por hora 21/10 11:00' }).textContent).toContain('Borrado (48 h)');

    const second = screen.getByRole('listitem', { name: 'Orden perdida EAGLE1-2026-V1-0002' });
    expect(second.textContent).toContain('Emitida el 23/10 10:40 por Mario Delgado');
    expect(screen.getByRole('listitem', { name: 'Orden perdida EAGLE1-2026-V1-0003' }).textContent).toContain(
      'No alcanza el saldo',
    );
    await userEvent.click(within(second).getByRole('button', { name: 'Recuperar' }));
    expect(await screen.findByText('Se recuperó la orden EAGLE1-2026-V1-0002 con su número original.'));
    expect(posts(t, `/lost-orders/${id(22)}/recover`)).toHaveLength(1);

    const third = screen.getByRole('listitem', { name: 'Orden perdida EAGLE1-2026-V1-0003' });
    await userEvent.click(within(third).getByRole('button', { name: 'Descartar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Descartar la orden EAGLE1-2026-V1-0003' });
    await userEvent.type(within(dialog).getByRole('textbox'), 'La orden no se llegó a entregar al chofer');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(posts(t, `/lost-orders/${id(23)}/discard`)).toHaveLength(1));
    expect(posts(t, `/lost-orders/${id(23)}/discard`)[0]!.body).toEqual({
      reason: 'La orden no se llegó a entregar al chofer',
    });
    expect(t.server.unhandled).toEqual([]);
  });

  it('sin contraseña la pide antes que nada, con la advertencia de F-16; no se puede respaldar ni restaurar', async () => {
    const t = await renderScreen(<BackupsScreen />, {
      path: '/respaldos',
      session,
      before: (s) => {
        serve(s, { status: status({ defined: false, setAt: null, confirmedAt: null }) });
        s.respond(backupPasswordApi.set, status());
      },
    });
    await screen.findByRole('heading', { name: 'Defina la contraseña de respaldo' });
    expect(screen.getByRole('button', { name: 'Hacer un respaldo ahora' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /^Restaurar el respaldo/ })).toHaveProperty('disabled', true);

    await userEvent.type(screen.getByLabelText('Contraseña de respaldo'), 'corta');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar la contraseña' }));
    expect(await screen.findAllByText(/al menos 12 caracteres \(tiene 5\)/)).not.toHaveLength(0);
    expect(posts(t, '/backups/password')).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText('Contraseña de respaldo'));
    await userEvent.type(screen.getByLabelText('Contraseña de respaldo'), PASSWORD);
    await userEvent.type(screen.getByLabelText('Confírmela'), PASSWORD);
    await userEvent.tab();
    expect(screen.getByText('Si la pierde, los respaldos no se podrán recuperar. Guárdela impresa'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar la contraseña' }));
    await waitFor(() => expect(posts(t, '/backups/password')).toHaveLength(1));
    expect(posts(t, '/backups/password')[0]!.body).toEqual({ password: PASSWORD, confirm: PASSWORD });
  });

  it('restaurar por pasos: la contraseña equivocada vuelve a pedirla; «RESTAURAR» habilita y termina con el resultado', async () => {
    const t = await renderScreen(<BackupsScreen />, {
      path: '/respaldos',
      session,
      before: (s) => {
        serve(s);
        s.respond(restoresApi.restore, (c: FakeCall) =>
          (c.body as { password: string }).password === PASSWORD
            ? { restoreId: id(19), lostOrders: 2, confirmationRequired: false }
            : { code: 'BACKUP_PASSWORD_INVALID', message: 'La contraseña de respaldo no es correcta.' },
        );
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /^Restaurar el respaldo del 23\/10\/2026/ }));
    const dialog = await screen.findByRole('dialog', { name: /^Restaurar el respaldo del 23\/10\/2026 20:00/ });
    const d = within(dialog);
    await userEvent.click(d.getByRole('button', { name: 'Seguir' }));
    expect(d.getByText('Escriba la contraseña de respaldo.'));

    await userEvent.type(d.getByLabelText('Contraseña de respaldo'), 'otra contraseña cualquiera');
    await userEvent.click(d.getByRole('button', { name: 'Seguir' }));
    expect(d.getByText('Lo que pasará'));
    expect(d.getByText('Se cierran todas las sesiones, también la suya.'));
    expect(d.getByRole('button', { name: 'Restaurar' })).toHaveProperty('disabled', true);
    await userEvent.type(d.getByLabelText('Escriba RESTAURAR para confirmar'), 'RESTAURAR');
    await userEvent.click(d.getByRole('button', { name: 'Restaurar' }));
    expect(await d.findByText('La contraseña de respaldo no es correcta.'));
    // Vuelve al paso de la contraseña.
    expect(d.getByLabelText('Contraseña de respaldo')).toHaveProperty('type', 'password');

    await userEvent.clear(d.getByLabelText('Contraseña de respaldo'));
    await userEvent.type(d.getByLabelText('Contraseña de respaldo'), PASSWORD);
    await userEvent.click(d.getByRole('button', { name: 'Seguir' }));
    await userEvent.click(d.getByRole('button', { name: 'Restaurar' }));
    expect(await d.findByText('2 órdenes perdidas'));
    expect(d.getByRole('button', { name: 'Volver a entrar' }));
    expect(posts(t, '/restores').map((c) => c.body)).toEqual([
      { backupId: id(1), password: 'otra contraseña cualquiera', confirm: 'RESTAURAR' },
      { backupId: id(1), password: PASSWORD, confirm: 'RESTAURAR' },
    ]);
  });

  it('la numeración: vacía no se envía; con los números, se confirma', async () => {
    const t = await renderScreen(<BackupsScreen />, {
      path: '/respaldos',
      session,
      before: (s) => {
        serve(s, {
          numbering: {
            required: true,
            vessels: [
              { id: id(30), name: 'Eagle 1', code: 'EAGLE1', lastOrderSeq: 41 },
              { id: id(31), name: 'Sol 2', code: 'SOL2', lastOrderSeq: 16 },
            ],
          },
        });
        s.respond(restoresApi.confirmNumbering, NO_NUMBERING);
      },
    });
    await screen.findByRole('heading', { name: 'Confirme la numeración' });
    await userEvent.type(screen.getByLabelText('Último impreso de Eagle 1'), '47');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar la numeración' }));
    expect(screen.getByText('Escriba el último número impreso.'));
    expect(posts(t, '/restores/numbering')).toHaveLength(0);

    await userEvent.type(screen.getByLabelText('Último impreso de Sol 2'), '16');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar la numeración' }));
    await waitFor(() => expect(posts(t, '/restores/numbering')).toHaveLength(1));
    expect(posts(t, '/restores/numbering')[0]!.body).toEqual({
      vessels: [
        { vesselId: id(30), lastPrinted: '47' },
        { vesselId: id(31), lastPrinted: '16' },
      ],
    });
    expect(await screen.findByText('Numeración confirmada: ya se pueden emitir órdenes.'));
  });
});
