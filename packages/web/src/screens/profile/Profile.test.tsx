import { userDtoSchema, type SessionDto } from '@impocaribe/shared/validation';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import {
  deleteOtherSessions,
  deleteSession,
  getSessions,
  postChangePassword,
  postLogout,
  postRecoveryCodes,
} from '../../api/endpoints/auth';
import type { StoredSession } from '../../session/app-session';
import { ProfileScreen } from './Profile.screen';

// T039 · P-05 Perfil (ui-spec), RF-AUT-07, RF-REC-03, RF-REC-06, RF-UI-06, F-04: el hook real y las tres presentaciones.
vi.setConfig({ testTimeout: 20_000 });

const USER = sampleOf(userDtoSchema, {
  fullName: 'Ilén Fernández Rojas',
  username: 'ilen.fernandez',
  role: 'apoderada',
  nationalId: '84011905548',
  phone: '52345678',
  mustChangePassword: false,
});
const SIGNED_IN: StoredSession = { token: 'token-1', expiresAt: '2026-10-15T16:40:00.000Z', user: USER };
const SESSIONS: SessionDto[] = [
  {
    id: '0199f0a1-0000-7000-8000-000000000001',
    deviceLabel: 'PC OFICINA',
    platform: 'windows',
    createdAt: '2026-10-14T12:12:00.000Z',
    expiresAt: '2026-10-15T12:12:00.000Z',
    lastSeenAt: '2026-10-14T16:30:00.000Z',
    current: true,
  },
  {
    id: '0199f0a1-0000-7000-8000-000000000002',
    deviceLabel: 'Teléfono de patio',
    platform: 'android',
    createdAt: '2026-10-13T11:40:00.000Z',
    expiresAt: '2026-11-12T11:40:00.000Z',
    lastSeenAt: '2026-10-14T15:00:00.000Z',
    current: false,
  },
];
const CODES = ['K7QM-3XTP', 'R2HW-9CND', 'F4ZB-7MRK', 'T8JX-2QPV', 'W3NC-6HDF', 'P9KR-4TZM', 'H6VQ-8BXN', 'M2DT-5WJC'];

const open = (path = '/perfil', options: Parameters<typeof renderScreen>[1] = {}) =>
  renderScreen(<ProfileScreen />, {
    path,
    route: '/perfil/:seccion?',
    session: SIGNED_IN,
    otherRoutes: ['/login'],
    ...options,
    before: (s) => {
      s.respond(getSessions, SESSIONS);
      options.before?.(s);
    },
  });

describe('P-05 en las tres clases', () => {
  it('TEL: lista de secciones que abren pantallas, con el número de sesiones y el tema', async () => {
    const t = await open('/perfil', { device: 'phone' });
    const list = screen.getByRole('list', { name: 'Secciones del perfil' });
    await waitFor(() =>
      expect(within(list).getByRole('button', { name: /Sesiones abiertas/ }).textContent).toContain('2'),
    );
    expect(within(list).getByRole('button', { name: /Tema/ }).textContent).toContain('Del sistema');
    expect(screen.getByText('ilen.fernandez · Apoderada')).not.toBeNull();
    await userEvent.click(within(list).getByRole('button', { name: /Sesiones abiertas/ }));
    expect(t.router.state.location.pathname).toBe('/perfil/sesiones');
    await userEvent.click(await screen.findByRole('button', { name: 'Perfil' }));
    expect(t.router.state.location.pathname).toBe('/perfil');
  });

  it.each(['tablet', 'desktop'] as const)('%s: secciones a la izquierda; sin elegir, las sesiones', async (device) => {
    const t = await open('/perfil', { device });
    const nav = screen.getByRole('navigation', { name: 'Secciones del perfil' });
    expect(within(nav).getByRole('button', { name: 'Sesiones abiertas' }).getAttribute('aria-current')).toBe('page');
    expect(await screen.findByRole('list', { name: 'Sesiones abiertas' })).not.toBeNull();
    await userEvent.click(within(nav).getByRole('button', { name: 'Apariencia' }));
    expect(t.router.state.location.pathname).toBe('/perfil/apariencia');
  });
});

describe('RF-AUT-07: sesiones abiertas', () => {
  it('muestra cada dispositivo con sus fechas en La Habana y cierra otra sesión', async () => {
    const t = await open('/perfil/sesiones', { before: (s) => s.respond(deleteSession) });
    const list = await screen.findByRole('list', { name: 'Sesiones abiertas' });
    const [current, other] = within(list).getAllByRole('listitem');
    expect(current!.textContent).toContain('PC OFICINA · Windows');
    expect(current!.textContent).toContain('Desde el 14/10/2026 08:12 · vence el 15/10/2026 08:12');
    expect(within(current!).getByText('Esta sesión')).not.toBeNull();
    expect(within(current!).queryByRole('button', { name: 'Cerrar' })).toBeNull();
    await userEvent.click(within(other!).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() =>
      expect(t.server.calls.find((c) => c.method === 'DELETE')!.path).toBe(`/auth/sessions/${SESSIONS[1]!.id}`),
    );
    await waitFor(() =>
      expect(t.server.calls.filter((c) => c.path === '/auth/sessions' && c.method === 'GET')).toHaveLength(2),
    );
  });

  it('cierra las demás sesiones de una vez', async () => {
    const t = await open('/perfil/sesiones', { before: (s) => s.respond(deleteOtherSessions) });
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar las demás sesiones' }));
    await waitFor(() =>
      expect(t.server.calls.some((c) => c.method === 'DELETE' && c.path === '/auth/sessions')).toBe(true),
    );
  });

  it('si no se pueden cargar, lo dice y deja reintentar', async () => {
    await open('/perfil/sesiones', {
      before: (s) => s.respond(getSessions, { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' }),
    });
    expect(await screen.findByText('Error interno del servidor.')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Reintentar' })).not.toBeNull();
  });
});

describe('F-04: cambio de contraseña', () => {
  const fill = async (current: string, next: string, confirm = next) => {
    await userEvent.type(await screen.findByLabelText('Contraseña actual'), current);
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), next);
    await userEvent.type(screen.getByLabelText('Confirmar'), confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
  };

  it('cambia la contraseña, lo confirma y vacía el formulario', async () => {
    const t = await open('/perfil/contrasena', { before: (s) => s.respond(postChangePassword) });
    await fill('actual-1234', 'nueva-1234');
    expect(await screen.findByText('Contraseña cambiada. Las demás sesiones se cerraron.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.path === '/auth/change-password')!.body).toEqual({
      current: 'actual-1234',
      password: 'nueva-1234',
      confirm: 'nueva-1234',
    });
    expect((screen.getByLabelText('Contraseña actual') as HTMLInputElement).value).toBe('');
  });

  it('la actual equivocada vuelve a su campo; la nueva igual a la actual no se envía', async () => {
    const t = await open('/perfil/contrasena', {
      before: (s) =>
        s.respond(postChangePassword, {
          code: 'VALIDATION_ERROR',
          message: 'Hay 1 campo por corregir.',
          details: { fields: { current: 'La contraseña actual no es correcta.' } },
        }),
    });
    await fill('misma-1234', 'misma-1234');
    expect(screen.getAllByText('La nueva contraseña debe ser distinta de la actual.').length).toBeGreaterThan(0);
    expect(t.server.calls.filter((c) => c.path === '/auth/change-password')).toEqual([]);
    await userEvent.clear(screen.getByLabelText('Nueva contraseña'));
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'otra-12345');
    await userEvent.clear(screen.getByLabelText('Confirmar'));
    await userEvent.type(screen.getByLabelText('Confirmar'), 'otra-12345');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    const field = screen.getByLabelText('Contraseña actual');
    await waitFor(() =>
      expect(document.getElementById(`${field.id}-msg`)!.textContent).toBe('La contraseña actual no es correcta.'),
    );
  });

  it('RF-REC-06: con contraseña temporal solo se ve el cambio, y al cambiarla se libera', async () => {
    const t = await open('/perfil', {
      device: 'desktop',
      session: { ...SIGNED_IN, user: { ...USER, mustChangePassword: true } },
      before: (s) => s.respond(postChangePassword),
    });
    expect(screen.getByText('Entró con una contraseña temporal: cámbiela para poder usar la app.')).not.toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Secciones del perfil' });
    expect(within(nav).getByRole('button', { name: 'Contraseña' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('button', { name: 'Sesiones abiertas' }).hasAttribute('disabled')).toBe(true);
    await fill('temporal-1', 'nueva-1234');
    await waitFor(() => expect(t.session.getState().session!.user.mustChangePassword).toBe(false));
    expect(within(nav).getByRole('button', { name: 'Sesiones abiertas' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('RF-REC-03: códigos de recuperación', () => {
  it('pide confirmación, muestra los nuevos con capturas bloqueadas y exige "Los copié a mano"', async () => {
    const t = await open('/perfil/codigos', { before: (s) => s.respond(postRecoveryCodes, { recoveryCodes: CODES }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Generar códigos nuevos' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Generar códigos nuevos?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generar' }));
    const list = await screen.findByRole('list', { name: 'Códigos de recuperación' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(CODES);
    expect(t.platform.calls).toContainEqual({ method: 'secureScreen', args: [true] });
    expect(screen.getByRole('button', { name: 'Listo' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByLabelText('Los copié a mano'));
    await userEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(screen.queryByRole('list', { name: 'Códigos de recuperación' })).toBeNull();
    await waitFor(() => expect(t.platform.calls).toContainEqual({ method: 'secureScreen', args: [false] }));
  });

  it('cancelar no genera nada', async () => {
    const t = await open('/perfil/codigos');
    await userEvent.click(await screen.findByRole('button', { name: 'Generar códigos nuevos' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(t.server.calls.filter((c) => c.path === '/auth/recovery-codes')).toEqual([]);
  });
});

describe('RF-UI-06: apariencia de este dispositivo', () => {
  it('el tema y "Reducir animaciones" se guardan en el dispositivo', async () => {
    const t = await open('/perfil/apariencia');
    await userEvent.click(screen.getByRole('radio', { name: 'Oscuro' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Reducir animaciones (solo en este dispositivo)' }));
    await waitFor(() => expect(t.session.getState().preferences).toEqual({ theme: 'dark', reduceMotion: true }));
    expect(screen.getByRole('radio', { name: 'Oscuro' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('RF-AUT-08: cerrar sesión', () => {
  it('avisa al servidor y borra la credencial de este dispositivo', async () => {
    const t = await open('/perfil', { device: 'phone', before: (s) => s.respond(postLogout) });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(t.session.getState().status).toBe('signedOut'));
    expect(t.server.calls.some((c) => c.path === '/auth/logout')).toBe(true);
  });

  it('aunque el servidor no responda, la credencial se borra', async () => {
    const t = await open('/perfil', {
      device: 'phone',
      before: (s) =>
        s.respond(postLogout, () => {
          throw new Error('red caída');
        }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(t.session.getState().status).toBe('signedOut'));
  });
});

describe('EST-03 y RF-CON-06: sin conexión', () => {
  it('lo que escribe en el servidor se desactiva con el motivo; cerrar sesión sigue permitido', async () => {
    await open('/perfil/contrasena', { online: false, local: [] });
    const change = await screen.findByRole('button', { name: 'Cambiar contraseña' });
    await waitFor(() => expect(change.hasAttribute('disabled')).toBe(true));
    expect(change.getAttribute('title')).toBe('Requiere conexión con el servidor');
  });
});
