import { act, screen, waitFor } from '@testing-library/react';
import { userDtoSchema } from '@impocaribe/shared/validation';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeServer, FIXED_TIME, sampleOf } from '../test/fake-server';
import { renderUi } from '../test/render';
import { TEST_PAIRING } from '../test/screen';
import { getSetupStatus } from './api/endpoints/auth';
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

async function start(hash: string, { paired = true, session = null as StoredSession | null } = {}) {
  const server = createFakeServer({ baseUrl: 'https://servidor.test:443/api/v1' });
  server.respond(getSetupStatus, { configured: true });
  const platform = await createTestPlatform({ http: server.transport });
  const app = new AppSession(platform, '1.0.0', () => new Date(FIXED_TIME));
  await app.load();
  if (paired) await app.paired(TEST_PAIRING);
  if (session) await app.signedIn(session);
  window.location.hash = hash;
  await act(async () => {
    renderUi(<App session={app} />, { device: 'desktop' });
  });
}

afterEach(() => {
  window.location.hash = '';
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
