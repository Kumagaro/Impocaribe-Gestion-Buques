import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { userDtoSchema } from '@impocaribe/shared/validation';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen, TEST_PAIRING } from '../../../test/screen';
import { getSetupStatus, postLogin } from '../../api/endpoints/auth';
import { LoginScreen } from './Login.screen';

// T038 · P-03 Iniciar sesión (ui-spec), F-03, RF-AUT-01, 02 y 05, RF-VAL-02: el hook real y las tres presentaciones.
// Escribir tecla a tecla supera los 5 s por defecto en una máquina cargada, como en P-02 y P-04.
vi.setConfig({ testTimeout: 20_000 });
const USER = sampleOf(userDtoSchema, {
  username: 'ilen.fernandez',
  role: 'apoderada',
  nationalId: '84011905548',
  phone: '52345678',
});
const OK = { token: 'token-1', expiresAt: '2026-10-15T16:40:00.000Z', user: USER };

async function open(options: Parameters<typeof renderScreen>[1] = {}, ready = true) {
  const t = await renderScreen(<LoginScreen />, {
    path: '/login',
    otherRoutes: ['/', '/recuperar', '/setup', '/perfil'],
    ...options,
    before: (server) => {
      server.respond(getSetupStatus, { configured: true });
      options.before?.(server);
    },
  });
  // La pantalla primero pregunta si el sistema está configurado (P-02).
  if (ready) await screen.findByLabelText('Usuario');
  return t;
}
const type = async (user: string, password: string) => {
  await userEvent.type(screen.getByLabelText('Usuario'), user);
  await userEvent.type(screen.getByLabelText('Contraseña'), password);
};
const enter = () => userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

describe('P-03 en las tres clases', () => {
  it.each([
    ['phone', 'fullscreen'],
    ['tablet', 'card'],
    ['desktop', 'card'],
  ] as const)('%s: pantalla completa en teléfono, tarjeta centrada en tablet y escritorio', async (device, layout) => {
    await open({ device });
    expect(screen.getByRole('main').getAttribute('data-layout')).toBe(layout);
    expect(screen.getByText('Conectado a IMPOCARIBE-7F3C')).not.toBeNull();
  });

  it.each(['phone', 'tablet', 'desktop'] as const)('%s: entra y va al tablero', async (device) => {
    const t = await open({ device, before: (s) => s.respond(postLogin, OK) });
    await type('Ilen.Fernandez', 'contraseña1');
    await enter();
    await waitFor(() => expect(t.router.state.location.pathname).toBe('/'));
    expect(t.session.getState()).toMatchObject({ status: 'signedIn', session: OK });
  });
});

describe('RF-AUT-01 y 02: lo que se envía', () => {
  it('usuario y contraseña, el dispositivo emparejado y "Mantener sesión" desmarcado por defecto', async () => {
    const t = await open({ before: (s) => s.respond(postLogin, OK) });
    await type('ilen.fernandez', 'contraseña1');
    await enter();
    await waitFor(() => expect(t.server.calls.some((c) => c.path === '/auth/login')).toBe(true));
    expect(t.server.calls.find((c) => c.path === '/auth/login')!.body).toEqual({
      username: 'ilen.fernandez',
      password: 'contraseña1',
      keepSignedIn: false,
      deviceId: TEST_PAIRING.deviceId,
      deviceLabel: 'PC OFICINA',
      platform: 'windows',
    });
  });

  it('con "Mantener sesión (30 días)" marcado lo pide', async () => {
    const t = await open({ before: (s) => s.respond(postLogin, OK) });
    await type('ilen.fernandez', 'contraseña1');
    await userEvent.click(screen.getByLabelText('Mantener sesión (30 días)'));
    await enter();
    await waitFor(() =>
      expect(t.server.calls.find((c) => c.path === '/auth/login')).toMatchObject({ body: { keepSignedIn: true } }),
    );
  });

  it('la contraseña se puede mostrar', async () => {
    await open();
    const input = screen.getByLabelText('Contraseña');
    expect(input.getAttribute('type')).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar la contraseña' }));
    expect(input.getAttribute('type')).toBe('text');
  });

  it('quien debe cambiar la contraseña va a su perfil (RF-REC-06)', async () => {
    const t = await open({
      before: (s) => s.respond(postLogin, { ...OK, user: { ...USER, mustChangePassword: true } }),
    });
    await type('ilen.fernandez', 'temporal-1');
    await enter();
    await waitFor(() => expect(t.router.state.location.pathname).toBe('/perfil'));
  });

  it('el enlace lleva a recuperar la contraseña', async () => {
    const t = await open();
    await userEvent.click(screen.getByRole('link', { name: '¿Olvidó la contraseña?' }));
    expect(t.router.state.location.pathname).toBe('/recuperar');
  });
});

describe('F-03 y RF-VAL-02: validación', () => {
  it('al enviar vacío marca los dos campos con su mensaje y no llama al servidor', async () => {
    const t = await open();
    await enter();
    expect(screen.getByText('Escriba el usuario.')).not.toBeNull();
    expect(screen.getByText('Escriba la contraseña.')).not.toBeNull();
    expect(t.server.calls.filter((c) => c.path === '/auth/login')).toEqual([]);
  });
});

describe('RF-AUT-05: fallos y bloqueo', () => {
  it('una contraseña equivocada lo dice sin decir cuál dato falló', async () => {
    await open({
      before: (s) => s.respond(postLogin, { code: 'FORBIDDEN', message: 'Usuario o contraseña incorrectos.' }),
    });
    await type('ilen.fernandez', 'mala');
    await enter();
    expect((await screen.findByRole('alert')).textContent).toContain('Usuario o contraseña incorrectos.');
  });

  it.each([
    [2, 'Le quedan 2 intentos antes del bloqueo de 15 minutos'],
    [1, 'Le queda 1 intento antes del bloqueo de 15 minutos'],
  ])('desde el 3.er fallo avisa en la contraseña: quedan %i', async (remainingAttempts, warning) => {
    await open({
      before: (s) =>
        s.respond(postLogin, {
          code: 'FORBIDDEN',
          message: 'Usuario o contraseña incorrectos.',
          details: { remainingAttempts },
        }),
    });
    await type('ilen.fernandez', 'mala');
    await enter();
    expect(await screen.findByText(warning)).not.toBeNull();
  });

  it('bloqueado, explica cuánto falta y no deja intentar', async () => {
    await open({
      before: (s) =>
        s.respond(postLogin, {
          code: 'ACCOUNT_LOCKED',
          message: 'Cuenta bloqueada por 5 intentos fallidos. Podrá intentarlo de nuevo en 12 minutos.',
          details: { lockedUntil: '2026-10-14T16:52:00.000Z' },
        }),
    });
    await type('ilen.fernandez', 'mala');
    await enter();
    expect((await screen.findByRole('alert')).textContent).toContain('Podrá intentarlo de nuevo en 12 minutos.');
    expect(screen.getByRole('button', { name: 'Entrar' }).hasAttribute('disabled')).toBe(true);
  });

  it('sin conexión lo dice', async () => {
    const t = await open();
    t.server.respond(postLogin, () => {
      throw new Error('red caída');
    });
    await type('ilen.fernandez', 'contraseña1');
    await enter();
    expect((await screen.findByRole('alert')).textContent).not.toBe('');
  });
});

describe('P-02: sistema sin configurar', () => {
  it('en otro dispositivo explica que se crea desde la PC servidor', async () => {
    await open({ before: (s) => s.respond(getSetupStatus, { configured: false }) }, false);
    expect(await screen.findByText('El sistema aún no está configurado: créelo desde la PC servidor.')).not.toBeNull();
    expect(screen.queryByLabelText('Usuario')).toBeNull();
  });

  it('en la PC servidor lleva al primer arranque', async () => {
    const t = await open(
      {
        pairing: { ...TEST_PAIRING, isServerPc: true },
        before: (s) => s.respond(getSetupStatus, { configured: false }),
      },
      false,
    );
    await waitFor(() => expect(t.router.state.location.pathname).toBe('/setup'));
  });
});

describe('MOV-07: acción en curso', () => {
  it('mientras entra, el botón se desactiva y lo anuncia', async () => {
    let release!: () => void;
    const t = await open();
    t.server.respond(postLogin, () => new Promise((r) => (release = () => r(OK))));
    await type('ilen.fernandez', 'contraseña1');
    await enter();
    const busy = await screen.findByRole('button', { name: 'Entrando…' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    await act(async () => release());
  });
});
