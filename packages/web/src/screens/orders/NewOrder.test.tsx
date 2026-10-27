import {
  userDtoSchema,
  type CarrierDto,
  type ClientDto,
  type DeclarationDto,
  type DriverDto,
  type OrderDto,
  type TrailerDto,
  type TruckDto,
  type VesselDto,
} from '@impocaribe/shared/validation';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { ordersApi } from '../../api/endpoints/orders';
import { getSyncChanges } from '../../api/endpoints/sync';
import type { StoredSession } from '../../session/app-session';
import { NewOrderScreen } from './NewOrder.screen';

// T086 · P-13 Nueva orden (ui-spec y maqueta T085), RF-ORD-03 a 05, 12, 13, HU-01: el hook real, la copia local real y
// las tres presentaciones. La hora de las pruebas es el 14/10/2026 (FIXED_TIME).
vi.setConfig({ testTimeout: 40_000 });

const session = (role: 'apoderada' | 'operador'): StoredSession => ({
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
const REASON = 'Remolques reforzados, autorizado';

const CLIENT: ClientDto = {
  id: id(1),
  name: 'Nuevos Tiempos S.R.L.',
  active: true,
  rowVersion: 1,
  recipients: [{ id: id(2), name: 'Almacén Central', address: 'Calle 100 y Boyeros, La Habana', active: true }],
};
const CARRIER: CarrierDto = { id: id(3), name: 'Transportes Escambray', active: true, rowVersion: 1 };
const trailer = (n: number, plate: string, tons: string): TrailerDto => ({
  id: id(n),
  plate,
  capacityTons: tons,
  carrierId: CARRIER.id,
  active: true,
  rowVersion: 1,
});
const TRAILERS = [trailer(4, 'W006877', '30.000'), trailer(5, 'W006878', '20.000'), trailer(6, 'W006879', '25.000')];
const TRUCK: TruckDto = {
  id: id(7),
  plate: 'W011612',
  tractorPlate: null,
  baseLocation: 'LA HABANA',
  carrierId: CARRIER.id,
  trailerIds: [id(4), id(5)],
  active: true,
  rowVersion: 1,
};
const DRIVER: DriverDto = {
  id: id(8),
  fullName: 'Juan Carlos Miranda',
  nationalId: '84011905548',
  licenseNo: '12345678901',
  carrierId: CARRIER.id,
  active: true,
  rowVersion: 1,
};
const VESSEL: VesselDto = {
  id: id(9),
  name: 'Eagle 1',
  code: 'EAGLE1',
  manifest: '0080/2026',
  bl: 'BL-1',
  port: 'Mariel, terminal 2',
  internalBuyer: 'IMPOCARIBE S.A.',
  etaDate: null,
  arrivalDate: '2026-10-10',
  voyageNo: 2,
  totalTons: '1000.000',
  allocatedTons: '100.000',
  loadedTons: '0.000',
  freeTons: '900.000',
  remainingTons: '1000.000',
  disposedOutTons: '0.000',
  surplusTons: '1000.000',
  unresolvedSurplusTons: '1000.000',
  status: 'open',
  closedAt: null,
  hasOrders: false,
  rowVersion: 1,
};
const DM: DeclarationDto = {
  id: id(10),
  number: '00431',
  clientId: CLIENT.id,
  brand: 'Dosel',
  totalTons: '100.000',
  declarationDate: '2026-10-02',
  deadlineStartDate: '2026-10-02',
  expiredAt: null,
  versionNo: 1,
  allocatedTons: '100.000',
  loadedTons: '0.000',
  balanceTons: '100.000',
  pendingAllocationTons: '0.000',
  allocations: [
    {
      id: id(11),
      vesselId: VESSEL.id,
      allocatedTons: '100.000',
      loadedTons: '0.000',
      balanceTons: '100.000',
      rowVersion: 1,
    },
  ],
  rowVersion: 1,
};
const LOCAL = [
  { entityType: 'client' as const, entityId: CLIENT.id, payload: CLIENT },
  { entityType: 'carrier' as const, entityId: CARRIER.id, payload: CARRIER },
  ...TRAILERS.map((t) => ({ entityType: 'trailer' as const, entityId: t.id, payload: t })),
  { entityType: 'truck' as const, entityId: TRUCK.id, payload: TRUCK },
  { entityType: 'driver' as const, entityId: DRIVER.id, payload: DRIVER },
  { entityType: 'vessel' as const, entityId: VESSEL.id, payload: VESSEL },
  { entityType: 'declaration' as const, entityId: DM.id, payload: DM },
];
const issued = (tons = '17.280'): OrderDto => {
  const current = {
    ...sampleOf(ordersApi.issue.output!).current,
    versionNo: 1,
    status: 'official' as const,
    tons,
    truckId: TRUCK.id,
    driverId: DRIVER.id,
    recipientId: CLIENT.recipients[0]!.id,
    trailerIds: [id(4), id(5)],
    loadingDate: '2026-10-14',
  };
  return {
    ...sampleOf(ordersApi.issue.output!),
    id: id(20),
    number: 'EAGLE1-2026-V2-0001',
    declarationId: DM.id,
    allocationId: id(11),
    vesselId: VESSEL.id,
    status: 'official',
    current,
    versions: [current],
  } as OrderDto;
};

const open = (options: Parameters<typeof renderScreen>[1] = {}) =>
  renderScreen(<NewOrderScreen />, {
    path: '/ordenes/nueva',
    session: session('operador'),
    local: LOCAL,
    otherRoutes: ['/ordenes/:id', '/borradores'],
    ...options,
  });

async function fill(root: ReturnType<typeof within>, tons = '17,28') {
  await root.findByRole('option', { name: /^00431/ });
  await userEvent.selectOptions(root.getByLabelText('DM'), DM.id);
  // Una sola asignación y un solo destinatario: se proponen solos (RF-ORD-03).
  await waitFor(() => expect((root.getByLabelText('Buque') as HTMLSelectElement).value).toBe(id(11)));
  expect((root.getByLabelText('Destinatario') as HTMLSelectElement).value).toBe(CLIENT.recipients[0]!.id);
  await userEvent.selectOptions(root.getByLabelText('Transportista'), CARRIER.id);
  await userEvent.selectOptions(root.getByLabelText('Camión'), TRUCK.id);
  await userEvent.selectOptions(root.getByLabelText('Chofer'), DRIVER.id);
  await userEvent.type(root.getByLabelText('Toneladas'), tons);
  await userEvent.type(root.getByLabelText('Carta de porte'), '22352');
}

describe('P-13 en escritorio', () => {
  it('elige en cadena, propone los remolques del camión, calcula el saldo y emite con el cuerpo exacto', async () => {
    const t = await open({ before: (s) => s.respond(ordersApi.issue, issued()) });
    const page = within(document.body);
    await fill(page);
    // Los habituales del camión (ACLARAR-10): W006877 y W006878, 50,000 t.
    expect(screen.getByRole('button', { name: 'W006877 · 30,000 t' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'W006879 · 25,000 t' }).getAttribute('aria-pressed')).toBe('false');
    const panel = within(screen.getByRole('complementary', { name: 'Saldo de la asignación' }));
    expect(panel.getByText('100,000 t')).not.toBeNull();
    expect(panel.getByText('82,720 t')).not.toBeNull();
    expect(panel.getByText('Cabe en el saldo de la asignación')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Emitir' }));
    expect(await screen.findByText('EAGLE1-2026-V2-0001')).not.toBeNull();
    expect(t.server.calls.find((c) => c.method === 'POST' && c.path === '/orders')!.body).toEqual({
      declarationId: DM.id,
      allocationId: id(11),
      recipientId: CLIENT.recipients[0]!.id,
      truckId: TRUCK.id,
      trailerIds: [id(4), id(5)],
      driverId: DRIVER.id,
      tons: '17.280',
      waybillNo: '22352',
      loadingDate: '2026-10-14',
      lotNo: null,
      routeSheetNo: null,
      container: null,
    });
  });

  it('el sobregiro se ve al escribir y Emitir queda desactivado con el motivo', async () => {
    await open();
    await fill(within(document.body), '100,001');
    const msg = 'Esta orden pasa el saldo por 0,001 t. Quedan 100,000 t en la asignación.';
    expect((await screen.findAllByText(msg)).length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'Emitir' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('RF-ORD-13: pasar la capacidad abre la excepción con los números y reenvía con el motivo', async () => {
    const t = await open({
      before: (s) =>
        s.respond(ordersApi.issue, (call: { body: { overrides?: { capacity?: string } } }) =>
          call.body.overrides?.capacity
            ? issued('50.500')
            : {
                code: 'CAPACITY_REQUIRES_OVERRIDE',
                message: 'La orden pasa la capacidad de los remolques (50,000 t) por 0,500 t.',
                details: { capacityTons: '50.000', excessTons: '0.500' },
              },
        ),
    });
    await fill(within(document.body), '50,5');
    await userEvent.click(screen.getByRole('button', { name: 'Emitir' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'La orden pasa la capacidad de los remolques (50,000 t) por 0,500 t.',
    });
    await userEvent.type(within(dialog).getByLabelText('Motivo'), REASON);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Emitir con excepción' }));
    expect(await screen.findByText('EAGLE1-2026-V2-0001')).not.toBeNull();
    const posts = t.server.calls.filter((c) => c.method === 'POST' && c.path === '/orders');
    expect((posts[1]!.body as { overrides: unknown }).overrides).toEqual({ capacity: REASON });
  });

  it('tras emitir descarga el original con «Guardar como»', async () => {
    const t = await open({
      before: (s) => {
        s.respond(ordersApi.issue, issued());
        s.respond(ordersApi.pdf, {
          kind: 'original',
          fileName: 'EAGLE1-2026-V2-0001.pdf',
          mime: 'application/pdf',
          base64: btoa('%PDF-1.4'),
        });
      },
    });
    await fill(within(document.body));
    await userEvent.click(screen.getByRole('button', { name: 'Emitir' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar el original' }));
    expect(await screen.findByText('Se descargó el original de EAGLE1-2026-V2-0001.')).not.toBeNull();
    const saved = t.platform.calls.find((c) => c.method === 'saveFile')!;
    expect(saved.args[0]).toBe('EAGLE1-2026-V2-0001.pdf');
  });

  it('RF-ORD-06: lo escrito se guarda solo en este dispositivo', async () => {
    const t = await open();
    await fill(within(document.body));
    await waitFor(async () => {
      const [d] = await (await t.session.localStore()).localDrafts<{ tons: string }>();
      expect(d?.payload.tons).toBe('17,28');
    });
  });

  it('RF-ORD-06: emitida la orden, su borrador local se borra aunque la sincronización no termine', async () => {
    const t = await open({ before: (s) => s.respond(ordersApi.issue, issued()) });
    await fill(within(document.body));
    const store = await t.session.localStore();
    await waitFor(async () => expect(await store.localDrafts()).toHaveLength(1));
    // La app se cierra (o se queda sin red) mientras espera la sincronización de después de emitir.
    t.server.respond(getSyncChanges, () => new Promise(() => undefined));
    await userEvent.click(screen.getByRole('button', { name: 'Emitir' }));
    expect(await screen.findByText('EAGLE1-2026-V2-0001')).not.toBeNull();
    // Si quedara, al volver la conexión se subiría como borrador de una orden ya emitida.
    await waitFor(async () => expect(await store.localDrafts()).toEqual([]));
  });

  it('sin conexión se llena pero no se emite', async () => {
    await open({ online: false });
    await fill(within(document.body));
    expect((screen.getByRole('button', { name: 'Emitir' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('P-13 en teléfono', () => {
  it('cuatro pasos con el saldo arriba; la revisión muestra el documento', async () => {
    await open({ device: 'phone' });
    const page = within(document.body);
    await page.findByRole('option', { name: /^00431/ });
    await userEvent.selectOptions(page.getByLabelText('DM'), DM.id);
    expect(screen.queryByLabelText('Camión')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await userEvent.selectOptions(screen.getByLabelText('Transportista'), CARRIER.id);
    await userEvent.selectOptions(screen.getByLabelText('Camión'), TRUCK.id);
    await userEvent.selectOptions(screen.getByLabelText('Chofer'), DRIVER.id);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await userEvent.type(screen.getByLabelText('Toneladas'), '17,28');
    await userEvent.type(screen.getByLabelText('Carta de porte'), '22352');
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    const doc = screen.getByRole('article', { name: 'Documento de la orden por emitir' });
    expect(doc.textContent).toContain('17.280');
    expect(doc.textContent).toContain('Remolque No W006877');
    expect(screen.getByRole('button', { name: 'Emitir' })).not.toBeNull();
  });
});
