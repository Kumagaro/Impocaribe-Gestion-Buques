import { userDtoSchema, type UpdateCheck } from '@impocaribe/shared/validation';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { updatesApi } from '../../api/endpoints/updates';
import type { StoredSession } from '../../session/app-session';
import { useAlertFeed } from '../alerts/useAlertFeed';
import { ME } from '../orders/orders.fixtures';
import { AppUpdateProvider } from './AppUpdateProvider';
import { UpdateBand, UpgradeRequired } from './UpdateParts';

// T114 · RF-UPD-02 a 05, AL-15 y EST-07: el proveedor real, la banda y la pantalla obligatoria con el servidor falso.
vi.setConfig({ testTimeout: 40_000 });

const session: StoredSession = {
  token: 't',
  expiresAt: '2026-10-24T22:00:00.000Z',
  user: sampleOf(userDtoSchema, {
    id: ME,
    fullName: 'Mario Delgado',
    role: 'operador',
    nationalId: '85020306548',
    phone: '52345678',
    mustChangePassword: false,
  }),
};
const check = (extra: Partial<UpdateCheck> = {}): UpdateCheck => ({
  latest: '1.4.0',
  minSupported: '1.0.0',
  mustUpdate: false,
  updateAvailable: true,
  notes: 'Tablero más rápido.',
  downloadUrl: '/api/v1/updates/windows/1.4.0/download',
  sha256: 'b'.repeat(64),
  ...extra,
});

function LocalAlerts() {
  return (
    <ul aria-label="Alertas de este dispositivo">
      {useAlertFeed().locals.map((a) => (
        <li key={a.type}>{`${a.type}: ${a.title} ${a.detail}`}</li>
      ))}
    </ul>
  );
}
const harness = (
  <AppUpdateProvider>
    <UpdateBand />
    <UpgradeRequired drafts={2} onDrafts={() => undefined} />
    <LocalAlerts />
  </AppUpdateProvider>
);

describe('Actualizaciones de la app (RF-UPD-02 a 05)', () => {
  it('AL-15: banda y alerta; «Actualizar ahora» descarga del servidor emparejado con su progreso', async () => {
    let finish!: () => void;
    const installUpdate = vi.fn(
      (_u: unknown, onProgress?: (received: number, total: number) => void) =>
        new Promise<void>((resolve) => {
          onProgress?.(25_165_824, 40_475_033);
          finish = resolve;
        }),
    );
    const t = await renderScreen(harness, {
      session,
      installUpdate,
      before: (s) => s.respond(updatesApi.check, check()),
    });
    expect(await screen.findByText('Hay una versión nueva: 1.4.0.')).not.toBeNull();
    expect(screen.getByRole('list', { name: 'Alertas de este dispositivo' }).textContent).toContain(
      'AL-15: Hay una versión nueva de la app La 1.4.0 está lista en el servidor local. Este dispositivo tiene la 1.0.0.',
    );
    const asked = t.server.calls.find((c) => c.path === '/updates/check')!;
    expect(Object.fromEntries(asked.query)).toEqual({ platform: 'windows', version: '1.0.0' });

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar ahora' }));
    expect(await screen.findByText('Descargando la 1.4.0… 24,0 de 38,6 MB')).not.toBeNull();
    expect(installUpdate.mock.calls[0]![0]).toEqual({
      url: 'https://servidor.test:443/api/v1/updates/windows/1.4.0/download',
      version: '1.4.0',
      sha256: 'b'.repeat(64),
    });
    await act(async () => finish());
  });

  it('«Más tarde» oculta la banda de esa versión un día; la alerta sigue', async () => {
    const t = await renderScreen(harness, { session, before: (s) => s.respond(updatesApi.check, check()) });
    await userEvent.click(await screen.findByRole('button', { name: 'Más tarde' }));
    await waitFor(() => expect(screen.queryByText('Hay una versión nueva: 1.4.0.')).toBeNull());
    expect(t.session.getState().preferences.updateLater).toEqual({
      version: '1.4.0',
      // Un día desde ahora (el reloj fijo de las pruebas).
      until: new Date(t.session.now().getTime() + 86_400_000).toISOString(),
    });
    expect(screen.getByRole('list', { name: 'Alertas de este dispositivo' }).textContent).toContain('AL-15');
  });

  it('EST-07: por debajo de la mínima, la pantalla completa con la versión lista y los borradores', async () => {
    await renderScreen(harness, {
      session,
      before: (s) => s.respond(updatesApi.check, check({ minSupported: '1.3.0', mustUpdate: true })),
    });
    expect(await screen.findByRole('heading', { name: 'Hay que actualizar la app' })).not.toBeNull();
    expect(
      screen.getByText(
        'Esta versión (1.0.0) ya no es compatible con el servidor. La 1.4.0 está lista para instalar desde el servidor local.',
      ),
    ).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Ver mis borradores (2)' })).not.toBeNull();
    // Obligatoria: no se ofrece «Más tarde» ni AL-15.
    expect(screen.queryByRole('button', { name: 'Más tarde' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Alertas de este dispositivo' }).textContent).not.toContain('AL-15');
  });

  it('EST-07 también tras un 426 de cualquier petición', async () => {
    const t = await renderScreen(harness, {
      session,
      before: (s) => s.respond(updatesApi.check, check({ latest: null, updateAvailable: false, downloadUrl: null })),
    });
    await waitFor(() => expect(t.server.calls.some((c) => c.path === '/updates/check')).toBe(true));
    expect(screen.queryByRole('heading', { name: 'Hay que actualizar la app' })).toBeNull();
    t.server.respond(updatesApi.list, {
      code: 'UPGRADE_REQUIRED',
      message: 'Esta versión de la app (1.0.0) ya no es compatible. Actualícela a la 1.3.0 o superior.',
      details: { appVersion: '1.0.0', minVersion: '1.3.0' },
    });
    await act(
      async () =>
        void (await t.session
          .api()
          .request(updatesApi.list)
          .catch(() => undefined)),
    );
    expect(await screen.findByRole('heading', { name: 'Hay que actualizar la app' })).not.toBeNull();
    expect(
      screen.getByText(
        'Esta versión (1.0.0) ya no es compatible con el servidor. Hace falta la 1.3.0 o una posterior; pida al responsable que la publique en el servidor.',
      ),
    ).not.toBeNull();
    const est07 = within(screen.getByRole('region', { name: 'Hay que actualizar la app' }));
    expect(est07.getByRole('button', { name: 'Actualizar ahora' })).toHaveProperty('disabled', true);
    expect(est07.getByText('Todavía no hay una versión publicada en el servidor.')).not.toBeNull();
  });
});
