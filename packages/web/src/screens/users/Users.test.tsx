import type { UserListItem } from '@impocaribe/shared/validation';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../../../test/screen';
import {
  activateUser,
  deactivateUser,
  getUsers,
  patchUser,
  postUser,
  resetUserPassword,
} from '../../api/endpoints/users';
import type { StoredSession } from '../../session/app-session';
import { UsersScreen } from './Users.screen';
import { lastAccessText } from './useUsers';

// T040 · P-21 Usuarios (ui-spec), RF-USR-01 a 05, RF-REC-01, RF-REC-06, RF-AUT-04, F-02: el hook real y las tres
// presentaciones. FIXED_TIME es el 14/10/2026 16:40 UTC (12:40 en La Habana).
vi.setConfig({ testTimeout: 20_000 });

const user = (over: Partial<UserListItem>): UserListItem => ({
  id: '0199f0a1-0000-7000-8000-000000000001',
  username: 'ilen.fernandez',
  fullName: 'Ilén Fernández Rojas',
  nationalId: '84011905548',
  phone: '52345678',
  role: 'apoderada',
  active: true,
  mustChangePassword: false,
  rowVersion: 3,
  lastAccessAt: '2026-10-14T12:12:00.000Z',
  ...over,
});
const ILEN = user({});
const MARIO = user({
  id: '0199f0a1-0000-7000-8000-000000000002',
  username: 'mario.delgado',
  fullName: 'Mario Delgado Pérez',
  nationalId: '85020312345',
  role: 'operador',
  rowVersion: 7,
  lastAccessAt: '2026-10-13T22:05:00.000Z',
});
const OSCAR = user({
  id: '0199f0a1-0000-7000-8000-000000000003',
  username: 'oscar.leyva',
  fullName: 'Oscar Leyva Martín',
  nationalId: '79110412345',
  role: 'lectura',
  active: false,
  lastAccessAt: '2026-10-02T14:00:00.000Z',
});
const USERS = [ILEN, MARIO, OSCAR];
const SIGNED_IN: StoredSession = { token: 't', expiresAt: '2026-10-15T16:40:00.000Z', user: { ...ILEN } };
const CODES = ['K7QM-3XTP', 'R2HW-9CND', 'F4ZB-7MRK', 'T8JX-2QPV', 'W3NC-6HDF', 'P9KR-4TZM', 'H6VQ-8BXN', 'M2DT-5WJC'];

const open = (options: Parameters<typeof renderScreen>[1] = {}) =>
  renderScreen(<UsersScreen />, {
    path: '/usuarios',
    session: SIGNED_IN,
    ...options,
    before: (s) => {
      s.respond(getUsers, USERS);
      options.before?.(s);
    },
  });

const openUser = async (device: 'phone' | 'tablet' | 'desktop', name: string) => {
  if (device === 'desktop') await userEvent.click(await screen.findByRole('cell', { name }));
  else await userEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
};

describe('lastAccessText', () => {
  const now = new Date('2026-10-14T16:40:00.000Z');
  it.each([
    ['2026-10-14T12:12:00.000Z', 'Hoy 08:12'],
    ['2026-10-13T22:05:00.000Z', 'Ayer 18:05'],
    ['2026-10-02T14:00:00.000Z', '02/10/2026'],
    [null, 'Nunca'],
  ])('%s → %s', (iso, text) => {
    expect(lastAccessText(iso, now)).toBe(text);
  });
});

describe('P-21 en las tres clases', () => {
  it('ESC: tabla con rol, estado y último acceso', async () => {
    await open({ device: 'desktop' });
    const table = await screen.findByRole('table', { name: 'Usuarios' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      rows.map((r) =>
        within(r)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ['Ilén Fernández Rojas', 'ilen.fernandez', 'Apoderada', 'Activo', 'Hoy 08:12'],
      ['Mario Delgado Pérez', 'mario.delgado', 'Operador', 'Activo', 'Ayer 18:05'],
      ['Oscar Leyva Martín', 'oscar.leyva', 'Solo lectura', 'Inactivo', '02/10/2026'],
    ]);
  });

  it.each(['phone', 'tablet'] as const)('%s: una tarjeta por usuario', async (device) => {
    await open({ device });
    const cards = within(await screen.findByRole('list', { name: 'Usuarios' })).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(cards[1]!.textContent).toContain('Operador · mario.delgado');
    expect(cards[1]!.textContent).toContain('Último acceso ayer 18:05');
    expect(cards[2]!.textContent).toContain('Inactivo');
  });

  it('si la lista no carga, lo dice y deja reintentar', async () => {
    await open({
      before: (s) => s.respond(getUsers, { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' }),
    });
    expect(await screen.findByText('Error interno del servidor.')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Reintentar' })).not.toBeNull();
  });
});

describe('RF-USR-01 y RF-REC-01: alta', () => {
  it.each(['phone', 'tablet', 'desktop'] as const)(
    '%s: crea el usuario y muestra sus códigos una vez, con capturas bloqueadas',
    async (device) => {
      const created = {
        ...MARIO,
        id: '0199f0a1-0000-7000-8000-000000000009',
        username: 'yanet.ruiz',
        fullName: 'Yanet Ruiz Castro',
      };
      const t = await open({ device, before: (s) => s.respond(postUser, { user: created, recoveryCodes: CODES }) });
      await userEvent.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
      await userEvent.type(screen.getByLabelText('Nombre y apellidos'), 'Yanet Ruiz Castro');
      await userEvent.type(screen.getByLabelText('Usuario'), 'yanet.ruiz');
      await userEvent.type(screen.getByLabelText('Carné de identidad'), '90051212345');
      await userEvent.type(screen.getByLabelText('Teléfono'), '53456789');
      await userEvent.selectOptions(screen.getByLabelText('Rol'), 'lectura');
      await userEvent.type(screen.getByLabelText('Contraseña'), 'temporal-1');
      await userEvent.type(screen.getByLabelText('Confirmar'), 'temporal-1');
      await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

      const dialog = await screen.findByRole('dialog', { name: 'Códigos de Yanet Ruiz Castro' });
      expect(
        within(dialog)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual(CODES);
      expect(t.platform.calls).toContainEqual({ method: 'secureScreen', args: [true] });
      expect(t.server.calls.find((c) => c.method === 'POST' && c.path === '/users')!.body).toEqual({
        fullName: 'Yanet Ruiz Castro',
        username: 'yanet.ruiz',
        nationalId: '90051212345',
        phone: '53456789',
        role: 'lectura',
        password: 'temporal-1',
        confirm: 'temporal-1',
      });
      expect(within(dialog).getByRole('button', { name: 'Listo' }).hasAttribute('disabled')).toBe(true);
      await userEvent.click(within(dialog).getByLabelText('Los copié a mano'));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Listo' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      await waitFor(() => expect(t.platform.calls).toContainEqual({ method: 'secureScreen', args: [false] }));
      expect(t.server.calls.filter((c) => c.method === 'GET' && c.path === '/users')).toHaveLength(2);
    },
  );

  it('F-02: un carné repetido vuelve a su campo; uno sin fecha válida avisa sin bloquear', async () => {
    const message = 'Ya existe un usuario con el carné 85020312345.';
    await open({
      before: (s) =>
        s.respond(postUser, { code: 'DUPLICATE_NATIONAL_ID', message, details: { fields: { nationalId: message } } }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    await userEvent.type(screen.getByLabelText('Carné de identidad'), '85133112345');
    await userEvent.tab();
    expect(screen.getByText('Revise el carné: no empieza por una fecha de nacimiento válida')).not.toBeNull();
    await userEvent.clear(screen.getByLabelText('Carné de identidad'));
    await userEvent.type(screen.getByLabelText('Nombre y apellidos'), 'Yanet Ruiz Castro');
    await userEvent.type(screen.getByLabelText('Usuario'), 'yanet.ruiz');
    await userEvent.type(screen.getByLabelText('Carné de identidad'), '85020312345');
    await userEvent.type(screen.getByLabelText('Teléfono'), '53456789');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'temporal-1');
    await userEvent.type(screen.getByLabelText('Confirmar'), 'temporal-1');
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    const field = screen.getByLabelText('Carné de identidad');
    await waitFor(() => expect(document.getElementById(`${field.id}-msg`)!.textContent).toBe(message));
  });
});

describe('RF-USR-02, 03 y RF-AUT-04: edición', () => {
  it.each(['phone', 'tablet', 'desktop'] as const)(
    '%s: cambiar el rol avisa que se cerrarán sus sesiones y guarda con la versión que vio',
    async (device) => {
      const t = await open({
        device,
        before: (s) => s.respond(patchUser, { ...MARIO, role: 'lectura', rowVersion: 8 }),
      });
      await openUser(device, 'Mario Delgado Pérez');
      expect((screen.getByLabelText('Nombre y apellidos') as HTMLInputElement).value).toBe('Mario Delgado Pérez');
      await userEvent.selectOptions(screen.getByLabelText('Rol'), 'lectura');
      expect(screen.getByText('Se cerrarán sus sesiones')).not.toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      expect(await screen.findByText('Se guardaron los cambios de Mario Delgado Pérez.')).not.toBeNull();
      const call = t.server.calls.find((c) => c.method === 'PATCH')!;
      expect([call.path, call.body]).toEqual([
        `/users/${MARIO.id}`,
        {
          fullName: 'Mario Delgado Pérez',
          username: 'mario.delgado',
          nationalId: '85020312345',
          phone: '52345678',
          role: 'lectura',
          expectedVersion: 7,
        },
      ]);
    },
  );

  it('DT-23: si otro lo cambió antes, lo explica sin perder lo escrito', async () => {
    await open({
      before: (s) =>
        s.respond(patchUser, {
          code: 'STALE_RECORD',
          message: 'Otra persona cambió este usuario. Revise y guarde de nuevo.',
        }),
    });
    await openUser('desktop', 'Mario Delgado Pérez');
    await userEvent.clear(screen.getByLabelText('Teléfono'));
    await userEvent.type(screen.getByLabelText('Teléfono'), '53333333');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Otra persona cambió este usuario. Revise y guarde de nuevo.')).not.toBeNull();
    expect((screen.getByLabelText('Teléfono') as HTMLInputElement).value).toBe('53333333');
  });

  it('RF-USR-04: a la última Apoderada activa no se la puede desactivar ni cambiar de rol', async () => {
    await open();
    await openUser('desktop', 'Ilén Fernández Rojas');
    expect(screen.getByLabelText('Rol').hasAttribute('disabled')).toBe(true);
    const button = screen.getByRole('button', { name: 'Desactivar' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(
      screen.getAllByText(/No se puede desactivar ni cambiar de rol a la última Apoderada activa/).length,
    ).toBeGreaterThan(0);
  });
});

describe('RF-USR-03: activar y desactivar', () => {
  it('desactivar se confirma y cierra sus sesiones', async () => {
    const t = await open({ before: (s) => s.respond(deactivateUser, { ...MARIO, active: false }) });
    await openUser('desktop', 'Mario Delgado Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desactivar a Mario Delgado Pérez' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByText('Mario Delgado Pérez quedó inactivo y sus sesiones se cerraron.')).not.toBeNull();
    expect(t.server.calls.some((c) => c.path === `/users/${MARIO.id}/deactivate`)).toBe(true);
  });

  it('un inactivo se puede activar', async () => {
    const t = await open({ before: (s) => s.respond(activateUser, { ...OSCAR, active: true }) });
    await openUser('desktop', 'Oscar Leyva Martín');
    await userEvent.click(screen.getByRole('button', { name: 'Activar' }));
    expect(await screen.findByText('Oscar Leyva Martín quedó activo.')).not.toBeNull();
    expect(t.server.calls.some((c) => c.path === `/users/${OSCAR.id}/activate`)).toBe(true);
  });

  it('si el servidor rechaza (LAST_APODERADA), muestra su mensaje', async () => {
    const message =
      'No se puede desactivar ni cambiar de rol a la última Apoderada activa. Cree o active otra Apoderada antes.';
    await open({ before: (s) => s.respond(deactivateUser, { code: 'LAST_APODERADA', message }) });
    await openUser('desktop', 'Mario Delgado Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Desactivar' }));
    expect((await screen.findByRole('alert')).textContent).toContain(message);
  });
});

describe('RF-REC-06: restablecer la contraseña', () => {
  it('asigna una temporal que deberá cambiar al entrar', async () => {
    const t = await open({ before: (s) => s.respond(resetUserPassword, { ...MARIO, mustChangePassword: true }) });
    await openUser('desktop', 'Mario Delgado Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }));
    const dialog = await screen.findByRole('dialog', { name: 'Restablecer la contraseña de Mario Delgado Pérez' });
    await userEvent.type(within(dialog).getByLabelText('Contraseña temporal'), 'temporal-2');
    await userEvent.type(within(dialog).getByLabelText('Confirmar'), 'temporal-2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restablecer' }));
    expect(
      await screen.findByText(
        'Mario Delgado Pérez deberá cambiar la contraseña temporal al entrar. Sus sesiones se cerraron.',
      ),
    ).not.toBeNull();
    expect(t.server.calls.find((c) => c.path === `/users/${MARIO.id}/reset-password`)!.body).toEqual({
      password: 'temporal-2',
      confirm: 'temporal-2',
    });
  });
});
