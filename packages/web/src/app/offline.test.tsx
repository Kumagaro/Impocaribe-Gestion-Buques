import { act, screen, waitFor } from '@testing-library/react';
import { userDtoSchema } from '@impocaribe/shared/validation';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeServer, FIXED_TIME, sampleOf } from '../../test/fake-server';
import { renderUi } from '../../test/render';
import { syncResponses, TEST_EPOCH, TEST_PAIRING } from '../../test/screen';
import { getSyncState } from '../api/endpoints/sync';
import { App } from '../App';
import { createTestPlatform } from '../platform/test-platform';
import { AppSession, type StoredSession } from '../session/app-session';

// T047 · HU-06, RF-CON-01, 05, 06 y 10, RF-AUT-09: la app sin conexión. FIXED_TIME es el 14/10/2026 16:40 UTC, las
// 12:40 en La Habana.
const USER = sampleOf(userDtoSchema, {
  fullName: 'Ilén Fernández',
  role: 'operador',
  nationalId: '84011905548',
  phone: '52345678',
  mustChangePassword: false,
});
const HOUR = 3_600_000;

async function start(options: { online: boolean; expiresAt?: string; serverTime?: string; synced?: boolean }) {
  const server = createFakeServer({ baseUrl: 'https://servidor.test:443/api/v1' });
  syncResponses(server, [], options.online);
  if (options.serverTime)
    server.respond(getSyncState, { epoch: TEST_EPOCH, lastSeq: 1, schemaVersion: 1, serverTime: options.serverTime });
  const platform = await createTestPlatform({
    http: server.transport,
    ws: () => ({ send: () => undefined, close: () => undefined, on: () => undefined }),
  });
  const app = new AppSession(platform, '1.0.0', () => new Date(FIXED_TIME));
  await app.load();
  await app.paired(TEST_PAIRING);
  const session: StoredSession = { token: 't', expiresAt: options.expiresAt ?? '2026-10-15T16:40:00.000Z', user: USER };
  await app.signedIn(session);
  if (options.synced ?? true) {
    // La copia de la última sincronización, hecha a las 11:15 de La Habana.
    const store = await app.localStore();
    await store.replace([], 1, { epoch: TEST_EPOCH, schemaVersion: 1 });
    await store.setMeta({ syncedAt: '2026-10-14T15:15:00.000Z' });
  }
  window.location.hash = '#/';
  await act(async () => {
    renderUi(<App session={app} />, { device: 'desktop' });
  });
  return app;
}

afterEach(() => {
  window.location.hash = '';
});

describe('RF-CON-01 y 05: sin conexión abre igual, con la banda', () => {
  it('muestra la copia local con "Sin conexión · datos al {fecha y hora}" de la última sincronización', async () => {
    await start({ online: false });
    expect((await screen.findByText(/Sin conexión · datos al/)).textContent).toBe(
      'Sin conexión · datos al 14/10/2026 11:15',
    );
    expect(screen.getAllByRole('heading', { name: 'Tablero' }).length).toBeGreaterThan(0);
  });

  it('con conexión, la banda no ocupa espacio', async () => {
    await start({ online: true });
    await screen.findAllByRole('heading', { name: 'Tablero' });
    await waitFor(() => expect(screen.queryByText(/Sin conexión/)).toBeNull());
  });

  it('sin conexión y sin copia: la primera descarga necesita el servidor, y lo explica', async () => {
    await start({ online: false, synced: false });
    expect(
      await screen.findByText(
        'No hay conexión con el servidor. La primera descarga de datos de este dispositivo lo necesita.',
      ),
    ).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Reintentar' })).not.toBeNull();
  });
});

describe('RF-CON-10: hora del dispositivo', () => {
  it('si difiere más de 5 minutos de la del servidor, lo avisa', async () => {
    // El servidor marca 16:28 y el dispositivo 16:40: 12 minutos de diferencia.
    await start({ online: true, serverTime: '2026-10-14T16:28:00.000Z' });
    expect(
      await screen.findByText(
        'La hora de este dispositivo difiere 12 min de la del servidor. Ajústela: las fechas y plazos siempre usan la hora del servidor.',
      ),
    ).not.toBeNull();
  });

  it('con 5 minutos justos no avisa', async () => {
    await start({ online: true, serverTime: '2026-10-14T16:35:00.000Z' });
    await screen.findAllByRole('heading', { name: 'Tablero' });
    expect(screen.queryByText(/La hora de este dispositivo difiere/)).toBeNull();
  });
});

describe('RF-AUT-09: sesión vencida sin conexión', () => {
  it('dentro de las 72 horas desde el vencimiento sigue consultando la copia local', async () => {
    await start({ online: false, expiresAt: new Date(Date.parse(FIXED_TIME) - 72 * HOUR + 60_000).toISOString() });
    await screen.findByText(/Sin conexión · datos al/);
    expect(window.location.hash).toBe('#/');
  });

  it('pasadas las 72 horas exige iniciar sesión y borra la copia', async () => {
    const app = await start({
      online: false,
      expiresAt: new Date(Date.parse(FIXED_TIME) - 72 * HOUR - 60_000).toISOString(),
    });
    await waitFor(() => expect(window.location.hash).toBe('#/login'));
    expect(app.getState().status).toBe('signedOut');
    expect((await (await app.localStore()).meta()).seq).toBeNull();
  });
});
