import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { userDtoSchema } from '@impocaribe/shared/validation';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeServer, FIXED_TIME, sampleOf } from '../test/fake-server';
import { renderUi } from '../test/render';
import { TEST_PAIRING } from '../test/screen';
import { getSetupStatus } from './api/endpoints/auth';
import { getUsers } from './api/endpoints/users';
import { App } from './App';
import { createTestPlatform } from './platform/test-platform';
import { AppSession, type StoredSession } from './session/app-session';

// T038 · La app y sus rutas: a dónde lleva cada estado de la sesión (SessionGate).
const USER = sampleOf(userDtoSchema, {
  fullName: 'Ilén Fernández',
  role: 'apoderada',
  nationalId: '84011905548',
  phone: '52345678',
  mustChangePassword: false,
});
const SIGNED_IN: StoredSession = { token: 't', expiresAt: '2026-10-15T16:40:00.000Z', user: USER };

let started: AppSession;

async function start(hash: string, { paired = true, session = null as StoredSession | null } = {}) {
  const server = createFakeServer({ baseUrl: 'https://servidor.test:443/api/v1' });
  server.respond(getSetupStatus, { configured: true });
  server.respond(getUsers, []);
  const platform = await createTestPlatform({ http: server.transport });
  const app = new AppSession(platform, '1.0.0', () => new Date(FIXED_TIME));
  await app.load();
  if (paired) await app.paired(TEST_PAIRING);
  if (session) await app.signedIn(session);
  started = app;
  window.location.hash = hash;
  await act(async () => {
    renderUi(<App session={app} />, { device: 'desktop' });
  });
}

afterEach(() => {
  window.location.hash = '';
  document.documentElement.removeAttribute('data-theme');
});

describe('rutas según la sesión', () => {
  it('sin emparejar, cualquier ruta lleva a la conexión (P-01)', async () => {
    await start('#/usuarios', { paired: false });
    expect(await screen.findByRole('heading', { name: 'Buscando el servidor' })).not.toBeNull();
    expect(window.location.hash).toBe('#/conexion');
  });

  it('emparejado y sin sesión, lleva al login (P-03); recuperar sigue abierto', async () => {
    await start('#/');
    expect(await screen.findByLabelText('Usuario')).not.toBeNull();
    expect(window.location.hash).toBe('#/login');
  });

  it('con sesión, las pantallas de acceso llevan al tablero dentro de la estructura', async () => {
    await start('#/login', { session: SIGNED_IN });
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(document.body.textContent).toContain('Ilén Fernández');
    expect(screen.getAllByRole('heading', { name: 'Tablero' }).length).toBeGreaterThan(0);
  });

  it('quien debe cambiar la contraseña solo puede ir a su perfil (RF-REC-06)', async () => {
    await start('#/', { session: { ...SIGNED_IN, user: { ...USER, mustChangePassword: true } } });
    await waitFor(() => expect(window.location.hash).toBe('#/perfil'));
  });
});

describe('P-05 y RF-UI-06: preferencias de este dispositivo en toda la app', () => {
  it('el tema elegido se aplica al documento y vuelve al del sistema', async () => {
    await start('#/', { session: SIGNED_IN });
    await act(async () => started.setPreferences({ theme: 'dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await act(async () => started.setPreferences({ theme: 'system' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('T041: guardas de rol en la interfaz (spec §2, EST-05)', () => {
  const as = (role: 'apoderada' | 'operador' | 'lectura') => ({ ...SIGNED_IN, user: { ...USER, role } });

  it('la Apoderada entra a Usuarios', async () => {
    await start('#/usuarios', { session: as('apoderada') });
    expect(await screen.findByRole('button', { name: 'Nuevo usuario' })).not.toBeNull();
  });

  it.each(['operador', 'lectura'] as const)('%s: por enlace a Usuarios se explica y se ofrece volver', async (role) => {
    await start('#/usuarios', { session: as(role) });
    expect(await screen.findByText('No tiene permiso para ver esta pantalla')).not.toBeNull();
    expect(screen.getByText('Usuarios no está disponible para su rol.')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Nuevo usuario' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Volver al tablero' }));
    await waitFor(() => expect(window.location.hash).toBe('#/'));
  });

  it('el estado del servidor solo se ve en la PC servidor', async () => {
    await start('#/servidor', { session: as('apoderada') });
    expect(await screen.findByText('Estado del servidor solo se ve en la PC servidor.')).not.toBeNull();
  });
});
