import { userDtoSchema, type ClientDto, type DeclarationDto, type VesselDto } from '@impocaribe/shared/validation';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { declarationsApi } from '../../api/endpoints/vessels';
import type { StoredSession } from '../../session/app-session';
import { DeclarationsScreen } from './Declarations.screen';

// T072 · P-09 a P-11 (ui-spec y maqueta T070), RF-DM, RF-ASG-01, 02, RF-PLZ-04, 05, HU-04: el hook real, la copia
// local real y las tres presentaciones. La hora de las pruebas es el 14/10/2026 (FIXED_TIME).
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
const REASON = 'El cliente acepta completar con el próximo buque';

const CLIENT: ClientDto = {
  id: id(1),
  name: 'Nuevos Tiempos S.R.L.',
  active: true,
  rowVersion: 1,
  recipients: [{ id: id(2), name: 'Almacén Central', address: 'Calle 100 y Boyeros, La Habana', active: true }],
};
const EAGLE: VesselDto = {
  id: id(11),
  name: 'Eagle 1',
  code: 'EAGLE1',
  manifest: '0080/2026',
  bl: 'BL-1',
  port: 'Mariel',
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
  rowVersion: 1,
};
const dm = (n: number, number: string, extra: Partial<DeclarationDto> = {}): DeclarationDto => ({
  id: id(n),
  number,
  clientId: CLIENT.id,
  brand: 'Dosel',
  totalTons: '20000.000',
  declarationDate: '2026-09-20',
  deadlineStartDate: '2026-09-20',
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
  ...extra,
});
const ACTIVE = dm(21, '00431');
const NO_TOTAL = dm(22, '00438', {
  totalTons: null,
  allocatedTons: '0.000',
  balanceTons: null,
  pendingAllocationTons: null,
  allocations: [],
});
const EXPIRED = dm(23, '00402', {
  declarationDate: '2026-09-01',
  deadlineStartDate: '2026-09-01',
  expiredAt: '2026-10-01T04:00:00.000Z',
  allocatedTons: '0.000',
  pendingAllocationTons: '20000.000',
  allocations: [],
  rowVersion: 2,
});
const LOCAL = [
  { entityType: 'client' as const, entityId: CLIENT.id, payload: CLIENT },
  { entityType: 'vessel' as const, entityId: EAGLE.id, payload: EAGLE },
  ...[ACTIVE, NO_TOTAL, EXPIRED].map((d) => ({ entityType: 'declaration' as const, entityId: d.id, payload: d })),
];

const open = (options: Parameters<typeof renderScreen>[1] = {}) =>
  renderScreen(<DeclarationsScreen />, {
    path: '/dm',
    route: '/dm/:id?',
    session: session('operador'),
    local: LOCAL,
    ...options,
  });

describe('P-09 lista', () => {
  it('desktop: estado, saldo y plazo n/30 (ámbar desde el 25); filtros con contadores', async () => {
    await open();
    const row = (await screen.findByRole('cell', { name: '00431' })).closest('tr')!;
    expect(row.textContent).toContain('Activa');
    expect(row.textContent).toContain('25/30');
    expect(screen.getByRole('button', { name: 'Vencida 1' })).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Pendiente de total 1' }));
    expect(screen.queryByRole('cell', { name: '00431' })).toBeNull();
    expect(screen.getByRole('cell', { name: '00438' })).not.toBeNull();
  });

  it.each(['tablet', 'phone'] as const)('%s: tarjetas', async (device) => {
    await open({ device });
    const list = await screen.findByRole('list', { name: 'DM' });
    expect(await within(list).findByText('00402')).not.toBeNull();
  });

  it('busca por número, cliente o marca (HU-10)', async () => {
    await open();
    await screen.findByRole('cell', { name: '00431' });
    await userEvent.type(screen.getByLabelText('Buscar'), '0043');
    expect(screen.queryByRole('cell', { name: '00402' })).toBeNull();
    expect(screen.getByRole('cell', { name: '00438' })).not.toBeNull();
  });
});

describe('P-10 ficha', () => {
  it('una DM sin total muestra «Asignar» desactivado con el motivo (D11)', async () => {
    await open({ path: `/dm/${NO_TOTAL.id}` });
    const button = await screen.findByRole('button', { name: 'Asignar a un buque' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Registre el total de la DM antes de asignarla a un buque.').length).toBeGreaterThan(0);
  });

  it('una DM vencida muestra «Reactivar»; pide motivo y lo envía con la versión (RF-PLZ-04)', async () => {
    const t = await open({
      path: `/dm/${EXPIRED.id}`,
      before: (s) => s.respond(declarationsApi.reactivate, { ...EXPIRED, expiredAt: null, rowVersion: 3 }),
    });
    expect(await screen.findByText(/La DM venció el 01\/10\/2026/)).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reactivar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reactivar la DM 00402' });
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'La Aduana prorrogó el plazo');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reactivar' }));
    expect(await screen.findByText('La DM 00402 se reactivó: el plazo empieza hoy.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.path === `/declarations/${EXPIRED.id}/reactivate`)!.body).toEqual({
      reason: 'La Aduana prorrogó el plazo',
      expectedVersion: 2,
    });
  });

  it('el plazo con su barra y el aviso legal desplegable (RF-DM-13)', async () => {
    await open({ path: `/dm/${ACTIVE.id}` });
    expect(await screen.findByText('Plazo · día 25 de 30')).not.toBeNull();
    expect(screen.getByText('Último día para emitir: 19/10/2026.')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Aviso legal' }));
    expect(screen.getByText(/El plazo que muestra el sistema cuenta desde el registro/)).not.toBeNull();
  });
});

// RF-BIT-04: cada DM muestra su propio historial: sus versiones y los cambios de sus asignaciones, con autor y motivo.
describe('P-10 historial', () => {
  it('las versiones de la DM y los cambios de sus asignaciones, con quién y por qué', async () => {
    await open({
      path: `/dm/${ACTIVE.id}`,
      before: (s) =>
        s.respond(declarationsApi.history, {
          versions: [
            {
              versionNo: 1,
              kind: 'create',
              brand: 'Dosel',
              totalTons: null,
              reason: null,
              createdBy: 'Mario Delgado',
              createdAt: '2026-09-20T13:00:00.000Z',
            },
            {
              versionNo: 2,
              kind: 'edit',
              brand: 'Dosel',
              totalTons: '20000.000',
              reason: 'Llegó el total de la Aduana',
              createdBy: 'Ilén Fernández',
              createdAt: '2026-09-21T13:00:00.000Z',
            },
          ],
          allocationChanges: [
            {
              vesselId: EAGLE.id,
              kind: 'assign',
              previousTons: '0.000',
              newTons: '20000.000',
              reason: null,
              createdBy: 'Ilén Fernández',
              createdAt: '2026-09-21T14:00:00.000Z',
            },
          ],
        }),
    });
    await userEvent.click(await screen.findByRole('tab', { name: 'Historial' }));
    const items = (await screen.findByRole('list', { name: 'Historial' })).querySelectorAll('li');
    expect([...items].map((li) => li.textContent)).toEqual([
      'Versión 1 · Alta · Dosel · sin total · Mario Delgado',
      expect.stringMatching(
        /^Versión 2 · Edición · Dosel · 20.000,000 t · Ilén Fernández · Llegó el total de la Aduana$/,
      ),
      expect.stringMatching(/^Asignación · Eagle 1: 0,000 t → 20.000,000 t$/),
    ]);
  });
});

describe('P-11 alta y HU-04', () => {
  const fill = async (tons = '80000') => {
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva DM' }));
    const side = within(screen.getByRole('complementary'));
    await userEvent.type(side.getByLabelText('Número de DM'), '00450');
    await userEvent.selectOptions(side.getByLabelText('Cliente'), CLIENT.id);
    await userEvent.type(side.getByLabelText('Marca'), 'Dosel');
    await userEvent.type(side.getByLabelText('Total (t)'), tons);
    await userEvent.selectOptions(side.getByLabelText('Buque'), EAGLE.id);
    await userEvent.type(side.getByLabelText('Toneladas'), tons);
  };
  const exceeds = (s: { respond: (e: never, r: unknown) => void }) =>
    s.respond(declarationsApi.create as never, (call: { body: { allocation?: { confirmPartial?: boolean } } }) =>
      call.body.allocation?.confirmPartial
        ? dm(24, '00450', { totalTons: '80000.000' })
        : {
            code: 'ALLOCATION_EXCEEDS_VESSEL',
            message: 'La DM 00450 supera la cantidad restante del buque EAGLE1 en 50 000,000 t',
            details: { excessTons: '50000.000', freeTons: '30000.000' },
          },
    );

  it('el número de 4 dígitos se rechaza en el campo antes de enviar; la fecha es la de hoy, con el aviso', async () => {
    const t = await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva DM' }));
    expect((screen.getByLabelText('Fecha de la DM') as HTMLInputElement).value).toBe('14/10/2026');
    expect(screen.getAllByText(/El plazo que muestra el sistema/).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText('Número de DM'), '0431');
    await userEvent.click(screen.getByRole('button', { name: 'Crear DM' }));
    expect((await screen.findAllByText('El número de DM debe tener 5 dígitos (tiene 4).')).length).toBeGreaterThan(0);
    expect(t.server.calls.some((c) => c.method === 'POST' && c.path === '/declarations')).toBe(false);
  });

  it('el número que ya existe bloquea mientras se escribe (RF-DM-02)', async () => {
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva DM' }));
    await userEvent.type(screen.getByLabelText('Número de DM'), '00402');
    expect((await screen.findAllByText('La DM 00402 ya existe: el número no se repite nunca.')).length).toBeGreaterThan(
      0,
    );
    expect((screen.getByRole('button', { name: 'Crear DM' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('HU-04 «Sí»: con motivo, reenvía con confirmPartial', async () => {
    const t = await open({ before: exceeds });
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Crear DM' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'La DM 00450 supera la cantidad restante del buque EAGLE1 en 50 000,000 t',
    });
    await userEvent.type(within(dialog).getByLabelText('Motivo'), REASON);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, asignar 30 000,000 t' }));
    expect(await screen.findByText('Se creó la DM 00450.')).not.toBeNull();
    const posts = t.server.calls.filter((c) => c.method === 'POST' && c.path === '/declarations');
    expect(posts.map((c) => c.body)).toEqual([
      {
        number: '00450',
        clientId: CLIENT.id,
        brand: 'Dosel',
        totalTons: '80000.000',
        allocation: { vesselId: EAGLE.id, tons: '80000.000' },
      },
      {
        number: '00450',
        clientId: CLIENT.id,
        brand: 'Dosel',
        totalTons: '80000.000',
        allocation: { vesselId: EAGLE.id, tons: '80000.000', confirmPartial: true, reason: REASON },
      },
    ]);
  });

  it('HU-04 «No»: no se crea nada y el buque queda vacío', async () => {
    const t = await open({ before: exceeds });
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Crear DM' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect((within(screen.getByRole('complementary')).getByLabelText('Buque') as HTMLSelectElement).value).toBe('');
    expect(t.server.calls.filter((c) => c.method === 'POST' && c.path === '/declarations')).toHaveLength(1);
  });

  it('phone: el alta va en dos pasos', async () => {
    await open({ device: 'phone' });
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva DM' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nueva DM' });
    expect(within(sheet).queryByLabelText('Buque')).toBeNull();
    await userEvent.type(within(sheet).getByLabelText('Número de DM'), '00450');
    await userEvent.selectOptions(within(sheet).getByLabelText('Cliente'), CLIENT.id);
    await userEvent.type(within(sheet).getByLabelText('Marca'), 'Dosel');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Siguiente' }));
    expect(await within(sheet).findByLabelText('Buque')).not.toBeNull();
  });
});
