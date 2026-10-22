import { userDtoSchema, type ClientDto, type DeclarationDto, type VesselDto } from '@impocaribe/shared/validation';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { vesselsApi } from '../../api/endpoints/vessels';
import type { StoredSession } from '../../session/app-session';
import { VesselsScreen } from './Vessels.screen';

// T071 · P-07 y P-08 (ui-spec y maqueta T070), RF-BUQ-01 a 09, F-07, F-10: el hook real, la copia local real y las
// tres presentaciones.
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
const REASON = 'Humedad en el fondo de la bodega 3';

const vessel = (n: number, name: string, extra: Partial<VesselDto> = {}): VesselDto => ({
  id: id(n),
  name,
  code: name.toUpperCase().replace(/[^A-Z0-9]/g, ''),
  manifest: '0080/2026',
  bl: 'BL-1',
  port: 'Mariel, terminal 2',
  internalBuyer: 'IMPOCARIBE S.A.',
  etaDate: null,
  arrivalDate: '2026-08-30',
  voyageNo: 2,
  totalTons: '50000.000',
  allocatedTons: '20000.000',
  loadedTons: '0.000',
  freeTons: '30000.000',
  remainingTons: '50000.000',
  disposedOutTons: '0.000',
  surplusTons: '50000.000',
  unresolvedSurplusTons: '50000.000',
  status: 'open',
  closedAt: null,
  hasOrders: false,
  rowVersion: 3,
  ...extra,
});
const EAGLE = vessel(11, 'Eagle 1', { hasOrders: true });
const OCEAN = vessel(12, 'Ocean Pride', {
  arrivalDate: null,
  voyageNo: null,
  etaDate: '2026-10-28',
  totalTons: '100.000',
  allocatedTons: '100.000',
  freeTons: '0.000',
  remainingTons: '100.000',
  surplusTons: '100.000',
  unresolvedSurplusTons: '0.000',
});
const CLIENT: ClientDto = { id: id(1), name: 'Nuevos Tiempos S.R.L.', active: true, rowVersion: 1, recipients: [] };
const DM: DeclarationDto = {
  id: id(21),
  number: '00431',
  clientId: CLIENT.id,
  brand: 'Dosel',
  totalTons: '20000.000',
  declarationDate: '2026-10-01',
  deadlineStartDate: '2026-10-01',
  expiredAt: null,
  versionNo: 1,
  allocatedTons: '20000.000',
  loadedTons: '0.000',
  balanceTons: '20000.000',
  pendingAllocationTons: '0.000',
  allocations: [
    {
      id: id(31),
      vesselId: EAGLE.id,
      allocatedTons: '20000.000',
      loadedTons: '0.000',
      balanceTons: '20000.000',
      rowVersion: 1,
    },
  ],
  rowVersion: 1,
};
const LOCAL = [
  { entityType: 'client' as const, entityId: CLIENT.id, payload: CLIENT },
  { entityType: 'declaration' as const, entityId: DM.id, payload: DM },
  ...[EAGLE, OCEAN].map((v) => ({ entityType: 'vessel' as const, entityId: v.id, payload: v })),
];

const open = (options: Parameters<typeof renderScreen>[1] = {}) =>
  renderScreen(<VesselsScreen />, {
    path: '/buques',
    route: '/buques/:id?',
    session: session('operador'),
    local: LOCAL,
    ...options,
  });

describe('P-07 lista', () => {
  it('desktop: viaje, estado, arribo y saldos (RF-BUQ-06)', async () => {
    await open();
    const row = (await screen.findByRole('cell', { name: 'Eagle 1 · V2' })).closest('tr')!;
    expect(row.textContent).toContain('30/08/2026');
    expect(row.textContent).toContain('30 000,000 t');
    const ocean = screen.getByRole('cell', { name: 'Ocean Pride' }).closest('tr')!;
    expect(ocean.textContent).toContain('est. 28/10/2026');
  });

  it.each(['tablet', 'phone'] as const)('%s: tarjetas', async (device) => {
    await open({ device });
    const list = await screen.findByRole('list', { name: 'Buques' });
    expect(await within(list).findByText('Eagle 1 · V2')).not.toBeNull();
  });

  it('Solo lectura: sin alta ni acciones', async () => {
    await open({ session: session('lectura'), path: `/buques/${EAGLE.id}` });
    expect(await screen.findByText('Código')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Nuevo buque' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });
});

describe('P-08 ficha', () => {
  it('RF-BUQ-07: con órdenes, la fecha real tiene candado y no se corrige', async () => {
    await open({ path: `/buques/${EAGLE.id}` });
    expect(await screen.findAllByText(/fija el año y el viaje de números ya impresos/)).not.toHaveLength(0);
    expect((screen.getByRole('button', { name: 'Corregir el arribo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('RF-BUQ-08: «Cerrar» desactivado mientras falte destino, diciendo cuánto', async () => {
    await open({ path: `/buques/${EAGLE.id}` });
    expect(((await screen.findByRole('button', { name: 'Cerrar el buque' })) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Faltan 50 000,000 t de sobrante por darle destino.').length).toBeGreaterThan(0);
  });

  it('sin sobrante pendiente se cierra, con confirmación y la versión que vio', async () => {
    const t = await open({
      path: `/buques/${OCEAN.id}`,
      before: (s) => s.respond(vesselsApi.close, { ...OCEAN, status: 'closed', rowVersion: 4 }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar el buque' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cerrar Ocean Pride' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar el buque' }));
    expect(await screen.findByText('El buque Ocean Pride quedó cerrado.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.path === `/vessels/${OCEAN.id}/close`)!.body).toEqual({ expectedVersion: 3 });
  });

  it('las DM asignadas del buque', async () => {
    await open({ path: `/buques/${EAGLE.id}` });
    await userEvent.click(await screen.findByRole('tab', { name: 'DM (1)' }));
    expect(screen.getByRole('list', { name: 'DM asignadas' }).textContent).toContain('00431 · Nuevos Tiempos S.R.L.');
  });
});

describe('F-10 destinos del sobrante', () => {
  const surplus = { surplusTons: '50000.000', unresolvedTons: '50000.000', dispositions: [] };

  it('un Operador no ve «Merma»; transferir pide el buque destino y lo envía', async () => {
    const t = await open({
      path: `/buques/${EAGLE.id}`,
      before: (s) => {
        s.respond(vesselsApi.surplus, surplus);
        s.respond(vesselsApi.dispose, { ...surplus, unresolvedTons: '49990.000' });
      },
    });
    await userEvent.click(await screen.findByRole('tab', { name: 'Sobrante' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar un destino' }));
    const side = within(screen.getByRole('complementary'));
    const kinds = [...(side.getByLabelText('Tipo de destino') as HTMLSelectElement).options].map((o) => o.text);
    expect(kinds).not.toContain('Merma o pérdida');
    await userEvent.selectOptions(side.getByLabelText('Buque destino'), OCEAN.id);
    await userEvent.type(side.getByLabelText('Toneladas'), '10');
    await userEvent.type(side.getByLabelText('Motivo'), REASON);
    await userEvent.click(side.getByRole('button', { name: 'Registrar el destino' }));
    expect(await screen.findByText('Se registró el destino: transferir a otro buque.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.path === `/vessels/${EAGLE.id}/surplus-dispositions`)!.body).toEqual({
      kind: 'transfer',
      tons: '10.000',
      targetVesselId: OCEAN.id,
      reason: REASON,
    });
  });

  it('una Apoderada sí registra merma', async () => {
    await open({
      session: session('apoderada'),
      path: `/buques/${EAGLE.id}`,
      before: (s) => s.respond(vesselsApi.surplus, surplus),
    });
    await userEvent.click(await screen.findByRole('tab', { name: 'Sobrante' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar un destino' }));
    const kinds = [
      ...(within(screen.getByRole('complementary')).getByLabelText('Tipo de destino') as HTMLSelectElement).options,
    ].map((o) => o.text);
    expect(kinds).toContain('Merma o pérdida');
  });
});

describe('F-07 alta', () => {
  it('muestra el código derivado y envía los datos normalizados', async () => {
    const t = await open({ before: (s) => s.respond(vesselsApi.create, vessel(13, 'Sea Star', { voyageNo: 1 })) });
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo buque' }));
    const side = within(screen.getByRole('complementary'));
    await userEvent.type(side.getByLabelText('Nombre'), 'Sea Star');
    expect(side.getByText('Código: SEASTAR')).not.toBeNull();
    await userEvent.type(side.getByLabelText('Manifiesto'), '0090/2026');
    await userEvent.type(side.getByLabelText('B/L'), 'BL-9');
    await userEvent.type(side.getByLabelText('Puerto y terminal'), 'Mariel');
    await userEvent.type(side.getByLabelText('Comprador interno'), 'IMPOCARIBE S.A.');
    await userEvent.type(side.getByLabelText('Total (t)'), '38500,5');
    await userEvent.click(side.getByRole('button', { name: 'Crear buque' }));
    expect(await screen.findByText('Se creó el buque Sea Star.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.method === 'POST' && c.path === '/vessels')!.body).toEqual({
      name: 'Sea Star',
      manifest: '0090/2026',
      bl: 'BL-9',
      port: 'Mariel',
      internalBuyer: 'IMPOCARIBE S.A.',
      etaDate: null,
      arrivalDate: null,
      totalTons: '38500.500',
    });
  });
});
