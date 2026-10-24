import { userDtoSchema, type ReleaseDto } from '@impocaribe/shared/validation';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf, type FakeCall } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { updatesApi } from '../../api/endpoints/updates';
import type { StoredSession } from '../../session/app-session';
import { id, ME } from '../orders/orders.fixtures';
import { ReleasesScreen } from './Releases.screen';

// T114 · P-26 Versiones de la app (maqueta T114): el hook real y el servidor falso.
vi.setConfig({ testTimeout: 40_000 });

const session = (role: 'apoderada' | 'operador'): StoredSession => ({
  token: 't',
  expiresAt: '2026-10-24T22:00:00.000Z',
  user: sampleOf(userDtoSchema, {
    id: ME,
    fullName: 'Ilén Fernández',
    role,
    nationalId: '85020306548',
    phone: '52345678',
    mustChangePassword: false,
  }),
});
const release = (n: number, extra: Partial<ReleaseDto> = {}): ReleaseDto => ({
  id: id(n),
  platform: 'windows',
  version: '1.4.0',
  sha256: 'a'.repeat(64),
  sizeBytes: 96_888_422,
  notes: 'Tablero más rápido.',
  isMinSupported: false,
  devicesBelow: 2,
  publishedByName: 'Ilén Fernández',
  publishedAt: '2026-10-24T19:20:00.000Z',
  ...extra,
});
const RELEASES = [
  release(1),
  release(2, { version: '1.3.0', isMinSupported: true, notes: 'Respaldos.', devicesBelow: 0 }),
  release(3, { platform: 'android', version: '1.4.0', sizeBytes: 40_475_033 }),
];
const writes = (t: { server: { calls: FakeCall[] } }) => t.server.calls.filter((c) => c.method === 'POST');

describe('P-26 Versiones de la app', () => {
  it('las de esta plataforma primero, con la mínima; otra plataforma con su botón', async () => {
    await renderScreen(<ReleasesScreen />, {
      path: '/versiones',
      session: session('operador'),
      before: (s) => s.respond(updatesApi.list, RELEASES),
    });
    const newest = await screen.findByRole('row', { name: 'Versión 1.4.0' });
    expect(newest.textContent).toContain('La más nueva');
    expect(newest.textContent).toContain('92,4 MB');
    expect(screen.getByRole('row', { name: 'Versión 1.3.0' }).textContent).toContain('Mínima');
    expect(screen.getByText('Esta PC: 1.0.0 · al día')).not.toBeNull();
    // El Operador ve la lista, sin publicar ni marcar.
    expect(screen.queryByRole('button', { name: 'Publicar una versión' })).toBeNull();
    expect(screen.queryByRole('button', { name: /como mínima/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Android (APK)' }));
    expect(screen.getByRole('table', { name: 'Versiones de Android (APK)' }).textContent).toContain('38,6 MB');
    await userEvent.click(screen.getByRole('button', { name: 'Android System WebView' }));
    expect(screen.getByText('Todavía no hay versiones de Android System WebView publicadas.')).not.toBeNull();
  });

  it('marcar la mínima dice a cuántos deja fuera y la marca', async () => {
    const t = await renderScreen(<ReleasesScreen />, {
      path: '/versiones',
      session: session('apoderada'),
      before: (s) => {
        s.respond(updatesApi.list, RELEASES);
        s.respond(updatesApi.minSupported, release(1, { isMinSupported: true }));
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar la 1.4.0 como mínima' }));
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Marcar la 1.4.0 de Windows (instalador ligero) como mínima' }),
    );
    expect(dialog.getByText('Ahora hay 2 dispositivos con una versión anterior.')).not.toBeNull();
    await userEvent.click(dialog.getByRole('button', { name: 'Marcar como mínima' }));
    expect(await screen.findByText('La 1.4.0 es ahora la versión mínima.')).not.toBeNull();
    expect(writes(t).map((c) => c.path)).toEqual([`/updates/${id(1)}/min-supported`]);
  });

  it('publicar: valida la versión y el archivo, y lo sube en multipart', async () => {
    const t = await renderScreen(<ReleasesScreen />, {
      path: '/versiones',
      session: session('apoderada'),
      before: (s) => {
        s.respond(updatesApi.list, RELEASES);
        s.respond(updatesApi.publish, release(4, { platform: 'android', version: '1.5.0' }));
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar una versión' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Publicar una versión' }));
    await userEvent.selectOptions(dialog.getByLabelText('Plataforma'), 'android');
    expect(dialog.getByText('Tres números separados por puntos. La última es la 1.4.0.')).not.toBeNull();
    await userEvent.type(dialog.getByLabelText('Versión'), '1.5');
    await userEvent.click(dialog.getByRole('button', { name: 'Publicar' }));
    expect(
      dialog.getByText('Escriba la versión con tres números separados por puntos, por ejemplo 1.4.2.'),
    ).not.toBeNull();
    expect(dialog.getByText('Elija el archivo del instalador.')).not.toBeNull();
    expect(writes(t)).toEqual([]);

    await userEvent.type(dialog.getByLabelText('Versión'), '.0');
    await userEvent.type(dialog.getByLabelText('Novedades'), 'Correcciones');
    const apk = new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'impocaribe-1.5.0.apk');
    await userEvent.upload(dialog.getByLabelText('Archivo'), apk);
    expect(dialog.getByText('impocaribe-1.5.0.apk · 0,0 MB')).not.toBeNull();
    await userEvent.click(dialog.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText('Se publicó la 1.5.0. Los dispositivos verán el aviso.')).not.toBeNull();
    const sent = writes(t)[0]!;
    expect(sent.path).toBe('/updates');
    expect(sent.headers['Content-Type']).toBeUndefined();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('un rechazo del servidor queda en su campo', async () => {
    await renderScreen(<ReleasesScreen />, {
      path: '/versiones',
      session: session('apoderada'),
      before: (s) => {
        s.respond(updatesApi.list, RELEASES);
        s.respond(updatesApi.publish, {
          code: 'VALIDATION_ERROR',
          message: 'La versión 1.4.0 de Windows (instalador ligero) ya está publicada.',
          details: { fields: { version: 'La versión 1.4.0 de Windows (instalador ligero) ya está publicada.' } },
        });
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar una versión' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Publicar una versión' }));
    await userEvent.type(dialog.getByLabelText('Versión'), '1.4.0');
    await userEvent.upload(dialog.getByLabelText('Archivo'), new File(['MZ'], 'impocaribe-1.4.0.exe'));
    await userEvent.click(dialog.getByRole('button', { name: 'Publicar' }));
    expect(
      await dialog.findByText('La versión 1.4.0 de Windows (instalador ligero) ya está publicada.'),
    ).not.toBeNull();
  });
});
