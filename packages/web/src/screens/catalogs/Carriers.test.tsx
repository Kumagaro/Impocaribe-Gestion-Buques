import { userDtoSchema, type CarrierDto } from '@impocaribe/shared/validation';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { carriersApi } from '../../api/endpoints/catalogs';
import type { StoredSession } from '../../session/app-session';
import { CarriersScreen } from './Carriers.screen';

// T059 · P-20 Transportistas (ui-spec y maqueta T057), RF-CAT-02, 07, 08 y 10, F-12: el hook real, la copia local real
// y las tres presentaciones.
vi.setConfig({ testTimeout: 20_000 });

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
const ESCAMBRAY: CarrierDto = { id: id(1), name: 'Transportes Escambray', active: true, rowVersion: 3 };
const HABANA: CarrierDto = { id: id(2), name: 'Transportes Habana', active: true, rowVersion: 1 };
const LOCAL = [
  { entityType: 'carrier' as const, entityId: ESCAMBRAY.id, payload: ESCAMBRAY },
  { entityType: 'carrier' as const, entityId: HABANA.id, payload: HABANA },
  ...[11, 12].map((n) => ({
    entityType: 'trailer' as const,
    entityId: id(n),
    payload: {
      id: id(n),
      plate: `P${n}111`,
      capacityTons: '30.000',
      carrierId: ESCAMBRAY.id,
      active: true,
      rowVersion: 1,
    },
  })),
  {
    entityType: 'truck' as const,
    entityId: id(21),
    payload: {
      id: id(21),
      plate: 'W011612',
      tractorPlate: null,
      baseLocation: 'LA HABANA',
      carrierId: ESCAMBRAY.id,
      trailerIds: [id(11)],
      active: true,
      rowVersion: 1,
    },
  },
  {
    entityType: 'driver' as const,
    entityId: id(31),
    payload: {
      id: id(31),
      fullName: 'Juan Carlos Miranda',
      nationalId: '84011905548',
      licenseNo: '12345678901',
      carrierId: ESCAMBRAY.id,
      active: true,
      rowVersion: 1,
    },
  },
];

const open = (options: Parameters<typeof renderScreen>[1] = {}) =>
  renderScreen(<CarriersScreen />, {
    path: '/catalogos/transportistas',
    session: session('operador'),
    local: LOCAL,
    ...options,
  });

describe('P-20 en las tres clases', () => {
  it('desktop: tabla con su flota', async () => {
    await open();
    const row = (await screen.findByRole('cell', { name: 'Transportes Escambray' })).closest('tr')!;
    expect(row.textContent).toContain('1 camión · 2 remolques · 1 chofer');
  });

  it.each(['tablet', 'phone'] as const)('%s: tarjetas', async (device) => {
    await open({ device });
    const list = await screen.findByRole('list', { name: 'Transportistas' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    expect(list.textContent).toContain('Transportes Habana');
  });

  it('Solo lectura: sin alta y el detalle sin formulario (EST-05)', async () => {
    await open({ session: session('lectura') });
    await userEvent.click(await screen.findByRole('cell', { name: 'Transportes Escambray' }));
    expect(screen.queryByRole('button', { name: 'Nuevo transportista' })).toBeNull();
    expect(screen.queryByLabelText('Nombre')).toBeNull();
    expect(screen.getAllByText('1 camión · 2 remolques · 1 chofer').length).toBeGreaterThan(0);
  });
});

describe('RF-CAT-08: alta con el nombre igual o parecido', () => {
  it('el mismo nombre al normalizar bloquea; uno parecido solo avisa; uno nuevo se crea', async () => {
    const t = await open({
      before: (s) => s.respond(carriersApi.create, { ...HABANA, id: id(3), name: 'Transportes Oriente' }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo transportista' }));
    const name = screen.getByLabelText('Nombre');
    await userEvent.type(name, 'TRANSPORTES  ESCAMBRAY.');
    const same = 'Ya existe el transportista «Transportes Escambray»: es el mismo nombre escrito de otra forma.';
    expect((await screen.findAllByText(same)).length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'Crear transportista' }) as HTMLButtonElement).disabled).toBe(true);

    await userEvent.clear(name);
    await userEvent.type(name, 'Transporte Escambray');
    await userEvent.tab();
    expect(await screen.findByText('Hay un transportista parecido: Transportes Escambray')).not.toBeNull();

    await userEvent.clear(name);
    await userEvent.type(name, 'Transportes Oriente');
    await userEvent.click(screen.getByRole('button', { name: 'Crear transportista' }));
    expect(await screen.findByText('Se creó el transportista Transportes Oriente.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.method === 'POST' && c.path === '/carriers')!.body).toEqual({
      name: 'Transportes Oriente',
    });
  });
});

describe('edición y desactivación', () => {
  it('editar envía la versión que vio', async () => {
    const t = await open({
      before: (s) => s.respond(carriersApi.edit, { ...ESCAMBRAY, name: 'Transportes Escambray S.A.', rowVersion: 4 }),
    });
    await userEvent.click(await screen.findByRole('cell', { name: 'Transportes Escambray' }));
    const name = screen.getByLabelText('Nombre');
    await userEvent.clear(name);
    await userEvent.type(name, 'Transportes Escambray S.A.');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Se guardaron los cambios de Transportes Escambray S.A..')).not.toBeNull();
    expect(t.server.calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      name: 'Transportes Escambray S.A.',
      expectedVersion: 3,
    });
  });

  it('RF-CAT-10: desactivar avisa cuántos camiones, remolques y choferes deja sin elegir', async () => {
    const t = await open({
      before: (s) => s.respond(carriersApi.deactivate, { ...ESCAMBRAY, active: false, rowVersion: 4 }),
    });
    await userEvent.click(await screen.findByRole('cell', { name: 'Transportes Escambray' }));
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desactivar Transportes Escambray' });
    expect(dialog.textContent).toContain(
      'Este transportista tiene 1 camión, 2 remolques y 1 chofer. Al desactivarlo, dejarán de poder elegirse en órdenes nuevas.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByText(/Transportes Escambray quedó inactivo/)).not.toBeNull();
    expect(t.server.calls.some((c) => c.path === `/carriers/${ESCAMBRAY.id}/deactivate`)).toBe(true);
  });
});
