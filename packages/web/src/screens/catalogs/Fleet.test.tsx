import { userDtoSchema, type DriverDto, type TrailerDto, type TruckDto } from '@impocaribe/shared/validation';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { changeDriverCarrier, trucksApi } from '../../api/endpoints/catalogs';
import type { StoredSession } from '../../session/app-session';
import { FleetScreen } from './Fleet.screen';

// T058 · P-18 Choferes y camiones (ui-spec y maqueta T057), RF-CAT-03 a 09, F-13: el hook real, la copia local real y
// las tres presentaciones.
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
const ESCAMBRAY = { id: id(1), name: 'Transportes Escambray', active: true, rowVersion: 1 };
const HABANA = { id: id(2), name: 'Transportes Habana', active: true, rowVersion: 1 };
const trailer = (n: number, plate: string, tons: string, carrierId = ESCAMBRAY.id): TrailerDto => ({
  id: id(n),
  plate,
  capacityTons: tons,
  carrierId,
  active: true,
  rowVersion: 1,
});
const TRAILERS = [
  trailer(11, 'P011111', '30.000'),
  trailer(12, 'P022222', '32.500'),
  trailer(13, 'P033333', '28.000', HABANA.id),
];
const TRUCK: TruckDto = {
  id: id(21),
  plate: 'W011612',
  tractorPlate: null,
  baseLocation: 'LA HABANA',
  carrierId: ESCAMBRAY.id,
  trailerIds: [id(11)],
  active: true,
  rowVersion: 1,
};
const JUAN: DriverDto = {
  id: id(31),
  fullName: 'Juan Carlos Miranda',
  nationalId: '84011905548',
  licenseNo: '12345678901',
  carrierId: ESCAMBRAY.id,
  active: true,
  rowVersion: 4,
};
const LOCAL = [
  ...[ESCAMBRAY, HABANA].map((c) => ({ entityType: 'carrier' as const, entityId: c.id, payload: c })),
  ...TRAILERS.map((t) => ({ entityType: 'trailer' as const, entityId: t.id, payload: t })),
  { entityType: 'truck' as const, entityId: TRUCK.id, payload: TRUCK },
  { entityType: 'driver' as const, entityId: JUAN.id, payload: JUAN },
];

const open = (options: Parameters<typeof renderScreen>[1] = {}) =>
  renderScreen(<FleetScreen />, {
    path: '/catalogos/choferes-camiones',
    session: session('operador'),
    local: LOCAL,
    ...options,
  });

describe('P-18 en las tres clases', () => {
  it('desktop: camiones con su capacidad y transportista; las pestañas cuentan', async () => {
    await open();
    const row = (await screen.findByRole('cell', { name: 'W011612' })).closest('tr')!;
    expect(row.textContent).toContain('30,000');
    expect(row.textContent).toContain('Transportes Escambray');
    expect(screen.getByRole('tab', { name: 'Remolques (3)' })).not.toBeNull();
  });

  it.each(['tablet', 'phone'] as const)('%s: tarjetas', async (device) => {
    await open({ device });
    const list = await screen.findByRole('list', { name: 'Camiones' });
    expect(await within(list).findByText('W011612')).not.toBeNull();
  });

  it('el filtro por transportista y la búsqueda del chofer por carné', async () => {
    await open();
    await userEvent.click(await screen.findByRole('tab', { name: 'Remolques (3)' }));
    await userEvent.selectOptions(screen.getByLabelText('Transportista'), HABANA.id);
    expect(screen.queryByRole('cell', { name: 'P011111' })).toBeNull();
    expect(screen.getByRole('cell', { name: 'P033333' })).not.toBeNull();

    await userEvent.selectOptions(screen.getByLabelText('Transportista'), '');
    await userEvent.click(screen.getByRole('tab', { name: 'Choferes (1)' }));
    await userEvent.type(screen.getByLabelText('Buscar por carné'), '9901');
    expect(screen.getByText('Ningún chofer coincide con el filtro.')).not.toBeNull();
    await userEvent.clear(screen.getByLabelText('Buscar por carné'));
    await userEvent.type(screen.getByLabelText('Buscar por carné'), '8401');
    expect(screen.getByRole('cell', { name: 'Juan Carlos Miranda' })).not.toBeNull();
  });

  it('Solo lectura: sin alta y el detalle sin formulario (EST-05)', async () => {
    await open({ session: session('lectura') });
    await userEvent.click(await screen.findByRole('cell', { name: 'W011612' }));
    expect(screen.queryByRole('button', { name: 'Nuevo camión' })).toBeNull();
    expect(screen.queryByLabelText('Chapa')).toBeNull();
    expect(screen.getByText('Capacidad total: 30,000 t')).not.toBeNull();
  });
});

describe('RF-CAT-03 y 04: el camión con sus remolques', () => {
  it('solo los remolques del transportista; la capacidad suma; viaja lo elegido', async () => {
    const t = await open({ before: (s) => s.respond(trucksApi.create, { ...TRUCK, id: id(22), plate: 'W022222' }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo camión' }));
    const form = screen.getByRole('complementary');
    await userEvent.selectOptions(within(form).getByLabelText('Transportista'), ESCAMBRAY.id);
    await userEvent.type(within(form).getByLabelText('Chapa'), 'w022222');
    expect(within(form).queryByRole('button', { name: /P033333/ })).toBeNull();
    await userEvent.click(within(form).getByRole('button', { name: 'P011111 · 30,000 t' }));
    await userEvent.click(within(form).getByRole('button', { name: 'P022222 · 32,500 t' }));
    expect(within(form).getByText('Capacidad total: 62,500 t')).not.toBeNull();
    await userEvent.click(within(form).getByRole('button', { name: 'Crear camión' }));
    expect(await screen.findByText('Se creó el camión W022222.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.method === 'POST' && c.path === '/trucks')!.body).toEqual({
      carrierId: ESCAMBRAY.id,
      plate: 'W022222',
      tractorPlate: null,
      baseLocation: 'LA HABANA',
      trailerIds: [id(11), id(12)],
    });
  });

  it('RF-CAT-08: una chapa repetida bloquea; sin remolques no se envía', async () => {
    const t = await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo camión' }));
    await userEvent.type(screen.getByLabelText('Chapa'), 'W011612');
    expect((await screen.findAllByText('Ya existe un camión con la chapa W011612.')).length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'Crear camión' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.clear(screen.getByLabelText('Chapa'));
    await userEvent.type(screen.getByLabelText('Chapa'), 'W099999');
    await userEvent.click(screen.getByRole('button', { name: 'Crear camión' }));
    expect(t.server.calls.some((c) => c.method === 'POST' && c.path === '/trucks')).toBe(false);
  });

  it('phone: el alta va por pasos', async () => {
    await open({ device: 'phone' });
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo camión' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nuevo camión' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Siguiente' }));
    expect(within(sheet).getByLabelText('Chapa')).not.toBeNull();
    await userEvent.selectOptions(within(sheet).getByLabelText('Transportista'), ESCAMBRAY.id);
    await userEvent.type(within(sheet).getByLabelText('Chapa'), 'W033333');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Siguiente' }));
    expect(within(sheet).queryByLabelText('Chapa')).toBeNull();
    await userEvent.click(within(sheet).getByRole('button', { name: 'P011111 · 30,000 t' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Siguiente' }));
    expect(within(sheet).getByText('W033333 · Transportes Escambray · 1 remolque(s) · 30,000 t')).not.toBeNull();
    expect(within(sheet).getByRole('button', { name: 'Crear camión' })).not.toBeNull();
  });
});

describe('RF-CAT-05, 08 y 09: choferes', () => {
  it('el carné repetido bloquea y dice de quién es', async () => {
    await open();
    await userEvent.click(await screen.findByRole('tab', { name: 'Choferes (1)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo chofer' }));
    await userEvent.type(screen.getByLabelText('Carné de identidad'), JUAN.nationalId);
    const same = `Ya existe un chofer con el carné ${JUAN.nationalId}: Juan Carlos Miranda.`;
    expect((await screen.findAllByText(same)).length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'Crear chofer' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('cambiar de transportista exige motivo y lo envía con la versión', async () => {
    const t = await open({
      before: (s) => s.respond(changeDriverCarrier, { ...JUAN, carrierId: HABANA.id, rowVersion: 5 }),
    });
    await userEvent.click(await screen.findByRole('tab', { name: 'Choferes (1)' }));
    await userEvent.click(screen.getByRole('cell', { name: 'Juan Carlos Miranda' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar de transportista' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cambiar el transportista de Juan Carlos Miranda' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Nuevo transportista'), HABANA.id);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cambiar' }));
    expect(t.server.calls.some((c) => c.path === `/drivers/${JUAN.id}/carrier`)).toBe(false);
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Pasó a trabajar con Transportes Habana');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cambiar' }));
    expect(await screen.findByText('Juan Carlos Miranda pasó a Transportes Habana.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.path === `/drivers/${JUAN.id}/carrier`)!.body).toEqual({
      carrierId: HABANA.id,
      reason: 'Pasó a trabajar con Transportes Habana',
      expectedVersion: 4,
    });
  });
});
