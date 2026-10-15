import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../../../test/screen';
import { postRecover } from '../../api/endpoints/auth';
import { RecoverScreen } from './Recover.screen';

// T038 · P-04 Recuperar contraseña (ui-spec), F-04, RF-REC-02 a 04: el hook real y las tres presentaciones.
// Seis campos escritos tecla a tecla superan los 5 s por defecto en una máquina cargada.
vi.setConfig({ testTimeout: 20_000 });
const open = (options: Parameters<typeof renderScreen>[1] = {}) =>
  renderScreen(<RecoverScreen />, { path: '/recuperar', otherRoutes: ['/login'], ...options });

async function fill() {
  await userEvent.type(screen.getByLabelText('Usuario'), 'Ilen.Fernandez');
  await userEvent.type(screen.getByLabelText('Carné'), '84011905548');
  await userEvent.type(screen.getByLabelText('Teléfono'), '+53 52345678');
  await userEvent.type(screen.getByLabelText('Código de recuperación'), 'k7qm3xtp');
  await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'nueva-clave');
  await userEvent.type(screen.getByLabelText('Confirmar'), 'nueva-clave');
}
const send = () => userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

describe('P-04 en las tres clases', () => {
  it.each([
    ['phone', 'fullscreen'],
    ['tablet', 'card'],
    ['desktop', 'card'],
  ] as const)('%s: cambia la contraseña con los datos y un código', async (device, layout) => {
    const t = await open({ device, before: (s) => s.respond(postRecover) });
    expect(screen.getByRole('main').getAttribute('data-layout')).toBe(layout);
    await fill();
    await send();
    expect(await screen.findByRole('heading', { name: 'Contraseña cambiada' })).not.toBeNull();
    // Normalizado como lo pide el esquema compartido: minúsculas, +53 quitado y el código en la forma impresa.
    expect(t.server.calls.find((c) => c.path === '/auth/recover')!.body).toEqual({
      username: 'ilen.fernandez',
      nationalId: '84011905548',
      phone: '52345678',
      code: 'K7QM-3XTP',
      password: 'nueva-clave',
      confirm: 'nueva-clave',
    });
    await userEvent.click(screen.getByRole('link', { name: 'Ir a iniciar sesión' }));
    expect(t.router.state.location.pathname).toBe('/login');
  });
});

describe('RF-REC-02 a 04: errores', () => {
  it('datos que no coinciden: el mensaje del servidor, sin decir cuál falló', async () => {
    await open({
      before: (s) => s.respond(postRecover, { code: 'RECOVERY_FAILED', message: 'Los datos no coinciden. Revíselos e inténtelo de nuevo.' }),
    });
    await fill();
    await send();
    expect((await screen.findByRole('alert')).textContent).toContain('Los datos no coinciden.');
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' }).hasAttribute('disabled')).toBe(false);
  });

  it('bloqueada tras 3 intentos: lo explica y no deja intentar', async () => {
    await open({
      before: (s) =>
        s.respond(postRecover, {
          code: 'RECOVERY_LOCKED',
          message: 'La recuperación de este usuario quedó bloqueada 1 hora por 3 intentos fallidos. Podrá intentarlo de nuevo en 60 minutos.',
        }),
    });
    await fill();
    await send();
    expect((await screen.findByRole('alert')).textContent).toContain('Podrá intentarlo de nuevo en 60 minutos.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cambiar contraseña' }).hasAttribute('disabled')).toBe(true));
  });

  it('F-04: valida antes de enviar y no llama al servidor', async () => {
    const t = await open();
    await userEvent.type(screen.getByLabelText('Código de recuperación'), 'K7Q');
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'corta');
    await send();
    expect(screen.getAllByText('El código tiene la forma XXXX-XXXX, como K7QM-3XTP.').length).toBeGreaterThan(0);
    expect(t.server.calls.filter((c) => c.path === '/auth/recover')).toEqual([]);
  });
});
