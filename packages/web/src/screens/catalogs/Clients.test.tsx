import { userDtoSchema, type ClientDto } from '@impocaribe/shared/validation';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { clientsApi } from '../../api/endpoints/catalogs';
import type { StoredSession } from '../../session/app-session';
import { ClientsScreen } from './Clients.screen';

// HU-08: clientes y destinatarios de una lista, sin repetidos ni datos incompletos.
// T059 · P-19 Clientes (ui-spec y maqueta T057), RF-CAT-01, 07 y 08, F-11: el hook real, la copia local real y las tres
// presentaciones.
vi.setConfig({ testTimeout: 30_000 });

const session = (role: 'apoderada' | 'operador' | 'lectura'): StoredSession => ({
  token: 't',
  expiresAt: '2026-10-15T16:40:00.000Z',
  user: sampleOf(userDtoSchema, {
    fullName: 'Mario Delgado',
    role,
    nationalId: '85020306548',
    phone: '52345678',
    mustChangePassword: false,
  }),
});
const id = (n: number) => `0199f0a1-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`;
const NUEVOS: ClientDto = {
  id: id(1),
  name: 'Nuevos Tiempos S.R.L.',
  active: true,
  rowVersion: 2,
  recipients: [
    { id: id(11), name: 'Almacén Central', address: 'Calle 100 y Boyeros, La Habana', active: true },
    { id: id(12), name: 'Almacén Este', address: 'Guanabacoa, La Habana', active: false },
  ],
};
const LOCAL = [{ entityType: 'client' as const, entityId: NUEVOS.id, payload: NUEVOS }];

const open = (options: Parameters<typeof renderScreen>[1] = {}) =>
  renderScreen(<ClientsScreen />, {
    path: '/catalogos/clientes',
    session: session('operador'),
    local: LOCAL,
    ...options,
  });

describe('P-19 en las tres clases', () => {
  it('desktop: tabla con cuántos destinatarios tiene', async () => {
    await open();
    const row = (await screen.findByRole('cell', { name: 'Nuevos Tiempos S.R.L.' })).closest('tr')!;
    expect(row.textContent).toContain('2 (1 inactivo)');
  });

  it.each(['tablet', 'phone'] as const)('%s: tarjetas', async (device) => {
    await open({ device });
    const list = await screen.findByRole('list', { name: 'Clientes' });
    expect(await within(list).findByText('Destinatarios: 2 (1 inactivo)')).not.toBeNull();
  });

  it('Solo lectura: los destinatarios sin formulario', async () => {
    await open({ session: session('lectura') });
    await userEvent.click(await screen.findByRole('cell', { name: 'Nuevos Tiempos S.R.L.' }));
    expect(screen.queryByRole('button', { name: 'Nuevo cliente' })).toBeNull();
    expect(screen.queryByLabelText('Nombre')).toBeNull();
    expect(screen.getByRole('list', { name: 'Destinatarios' }).textContent).toContain(
      'Almacén Este · Guanabacoa, La Habana (inactivo)',
    );
  });
});

describe('RF-CAT-01 y 08: alta', () => {
  it('el mismo nombre al normalizar bloquea', async () => {
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo cliente' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'NUEVOS TIEMPOS SRL');
    const same = 'Ya existe el cliente «Nuevos Tiempos S.R.L.»: es el mismo nombre escrito de otra forma.';
    expect((await screen.findAllByText(same)).length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'Crear cliente' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('con dos destinatarios', async () => {
    const t = await open({
      before: (s) => s.respond(clientsApi.create, { ...NUEVOS, id: id(2), name: 'Empresa Mayorista Pinar' }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo cliente' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Empresa Mayorista Pinar');
    const names = () => screen.getAllByLabelText('Nombre del destinatario');
    const addresses = () => screen.getAllByLabelText('Dirección');
    await userEvent.type(names()[0]!, 'Almacén Pinar');
    await userEvent.type(addresses()[0]!, 'Carretera Central km 2, Pinar del Río');
    await userEvent.click(screen.getByRole('button', { name: 'Añadir destinatario' }));
    await userEvent.type(names()[1]!, 'Tienda Viñales');
    await userEvent.type(addresses()[1]!, 'Calle Salvador Cisneros, Viñales');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));
    expect(await screen.findByText('Se creó el cliente Empresa Mayorista Pinar.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.method === 'POST' && c.path === '/clients')!.body).toEqual({
      name: 'Empresa Mayorista Pinar',
      recipients: [
        { name: 'Almacén Pinar', address: 'Carretera Central km 2, Pinar del Río' },
        { name: 'Tienda Viñales', address: 'Calle Salvador Cisneros, Viñales' },
      ],
    });
  });

  it('valida cada destinatario con F-11 antes de enviar', async () => {
    const t = await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo cliente' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Empresa Mayorista Pinar');
    await userEvent.type(screen.getByLabelText('Dirección'), 'Cuba');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));
    expect((await screen.findAllByText('Escriba el nombre del destinatario.')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('La dirección debe tener entre 5 y 250 caracteres (tiene 4).').length).toBeGreaterThan(
      0,
    );
    expect(t.server.calls.some((c) => c.method === 'POST' && c.path === '/clients')).toBe(false);
  });
});

describe('RF-CAT-01 y 07: edición', () => {
  it('un destinatario se desactiva (no se borra) y otro se añade; viaja la versión que vio', async () => {
    const t = await open({ before: (s) => s.respond(clientsApi.edit, { ...NUEVOS, rowVersion: 3 }) });
    await userEvent.click(await screen.findByRole('cell', { name: 'Nuevos Tiempos S.R.L.' }));
    expect(screen.queryByRole('button', { name: /Quitar el destinatario 1/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar el destinatario 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Añadir destinatario' }));
    await userEvent.type(screen.getAllByLabelText('Nombre del destinatario')[2]!, 'Almacén Oeste');
    await userEvent.type(screen.getAllByLabelText('Dirección')[2]!, 'Marianao, La Habana');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Se guardaron los cambios de Nuevos Tiempos S.R.L..')).not.toBeNull();
    expect(t.server.calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      name: 'Nuevos Tiempos S.R.L.',
      recipients: [
        { ...NUEVOS.recipients[0], active: false },
        NUEVOS.recipients[1],
        { name: 'Almacén Oeste', address: 'Marianao, La Habana' },
      ],
      expectedVersion: 2,
    });
  });
});
