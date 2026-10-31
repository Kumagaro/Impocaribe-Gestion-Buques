import { userDtoSchema, type BackupPasswordStatus } from '@impocaribe/shared/validation';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf, type FakeCall } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { backupPasswordApi } from '../../api/endpoints/backups';
import type { StoredSession } from '../../session/app-session';
import { ME } from '../orders/orders.fixtures';
import { BackupPasswordPrompt } from './BackupPasswordPrompt';

// T105 · RF-RES-08 y ui-spec §1.2: el diálogo de confirmación de la contraseña de respaldo tras el login.
vi.setConfig({ testTimeout: 40_000 });

const session = (role: 'apoderada' | 'operador'): StoredSession => ({
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
const status = (extra: Partial<BackupPasswordStatus> = {}): BackupPasswordStatus => ({
  defined: true,
  setAt: '2026-07-01T12:00:00.000Z',
  confirmedAt: '2026-07-01T12:00:00.000Z',
  due: true,
  postponesLeft: 3,
  ...extra,
});
const dialog = () => screen.queryByRole('dialog', { name: 'Confirme la contraseña de respaldo' });

describe('Confirmación de la contraseña de respaldo (RF-RES-08)', () => {
  it('si toca, la pide; una equivocada lo dice en el campo y la correcta cierra el diálogo', async () => {
    const t = await renderScreen(<BackupPasswordPrompt />, {
      session: session('apoderada'),
      before: (s) => {
        s.respond(backupPasswordApi.status, status());
        s.respond(backupPasswordApi.confirm, (c: FakeCall) =>
          (c.body as { password: string }).password === 'respaldo de prueba 2026'
            ? status({ due: false })
            : {
                code: 'BACKUP_PASSWORD_INVALID',
                message: 'La contraseña de respaldo no es correcta.',
                details: { fields: { password: 'La contraseña de respaldo no es correcta.' } },
              },
        );
      },
    });
    await waitFor(() => expect(dialog()).not.toBeNull());
    await userEvent.type(screen.getByLabelText('Contraseña de respaldo'), 'otra');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('La contraseña de respaldo no es correcta.')).not.toBeNull();
    await userEvent.clear(screen.getByLabelText('Contraseña de respaldo'));
    await userEvent.type(screen.getByLabelText('Contraseña de respaldo'), 'respaldo de prueba 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(t.server.calls.filter((c) => c.path === '/backups/password/confirm')).toHaveLength(2);
  });

  it('«Recordármelo mañana» la aplaza y dice cuántas veces quedan', async () => {
    const t = await renderScreen(<BackupPasswordPrompt />, {
      session: session('apoderada'),
      before: (s) => {
        s.respond(backupPasswordApi.status, status({ postponesLeft: 1 }));
        s.respond(backupPasswordApi.postpone, status({ due: false, postponesLeft: 0 }));
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Recordármelo mañana (queda 1 vez)' }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(t.server.calls.some((c) => c.path === '/backups/password/postpone')).toBe(true);
  });

  it('sin aplazamientos, «Ahora no» la cierra por esta sesión (AL-23 sigue abierta)', async () => {
    const t = await renderScreen(<BackupPasswordPrompt />, {
      session: session('apoderada'),
      before: (s) => s.respond(backupPasswordApi.status, status({ postponesLeft: 0 })),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Ahora no' }));
    expect(dialog()).toBeNull();
    expect(t.server.calls.some((c) => c.path === '/backups/password/postpone')).toBe(false);
  });

  it('a un Operador no se le pregunta nada', async () => {
    const t = await renderScreen(<BackupPasswordPrompt />, { session: session('operador') });
    await new Promise((r) => setTimeout(r, 200));
    expect(dialog()).toBeNull();
    expect(t.server.calls.some((c) => c.path === '/backups/password')).toBe(false);
  });
});
