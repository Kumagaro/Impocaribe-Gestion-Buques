import type { AuditEntryDto } from '@impocaribe/shared/validation';
import { userDtoSchema } from '@impocaribe/shared/validation';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf, type FakeCall } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { auditApi } from '../../api/endpoints/consultas';
import type { StoredSession } from '../../session/app-session';
import { id, ME } from '../orders/orders.fixtures';
import { AuditScreen } from './Audit.screen';
import { changesOf } from './useAudit';

// T104 · P-25 Bitácora (ui-spec P-25 y maqueta T099): el hook real y el servidor falso.
vi.setConfig({ testTimeout: 40_000 });

const session: StoredSession = {
  token: 't',
  expiresAt: '2026-10-15T16:40:00.000Z',
  user: sampleOf(userDtoSchema, {
    id: ME,
    fullName: 'Oscar Lectura',
    role: 'lectura',
    nationalId: '85020306548',
    phone: '52345678',
    mustChangePassword: false,
  }),
};
const entry = (n: number, extra: Partial<AuditEntryDto> = {}): AuditEntryDto => ({
  id: n,
  at: '2026-10-14T16:31:00.000Z',
  userName: 'Mario Delgado',
  deviceName: 'Tel. patio',
  action: 'order.correct',
  entityType: 'order',
  entityId: id(30),
  entityLabel: 'EAGLE1-2026-V1-0042',
  before: { versionNo: 1, tons: '17.280' },
  after: { versionNo: 2, tons: '18.000', reason: 'Peso corregido en la báscula' },
  reason: 'Peso corregido en la báscula',
  ok: true,
  ...extra,
});
const REJECTED = entry(2, {
  action: 'order.issue',
  entityLabel: null,
  entityId: null,
  before: null,
  after: { code: 'OVERDRAFT_ALLOCATION', message: 'Esta orden pasa el saldo por 0,280 t.' },
  reason: null,
  ok: false,
});
const audits = (t: { server: { calls: FakeCall[] } }) => t.server.calls.filter((c) => c.path === '/audit');

describe('P-25 Bitácora', () => {
  it('cada registro con su acción, entidad y detalle; se despliega con antes → después; los rechazos se marcan', async () => {
    await renderScreen(<AuditScreen />, {
      path: '/bitacora',
      session,
      before: (s) => s.respond(auditApi.list, { entries: [entry(3), REJECTED], next: null }),
    });
    const row = await screen.findByRole('row', { name: /^Corregir orden/ });
    expect(row.textContent).toContain('EAGLE1-2026-V1-0042');
    expect(row.textContent).toContain('Motivo: Peso corregido en la báscula');
    const rejected = screen.getByRole('row', { name: /^Emitir orden/ });
    expect(rejected.textContent).toContain('Rechazada');
    expect(rejected.textContent).toContain('Esta orden pasa el saldo por 0,280 t.');

    await userEvent.click(within(row).getByRole('button', { name: 'Ver el detalle' }));
    const diff = within(screen.getByRole('row', { name: 'Detalle: Corregir orden' }));
    expect(diff.getByRole('table').textContent).toContain('Versión12');
    expect(diff.getByRole('table').textContent).toContain('Toneladas17.28018.000');
  });

  it('filtra por DM u orden al dejar de escribir y por acción; «hasta» antes de «desde» no consulta', async () => {
    const t = await renderScreen(<AuditScreen />, {
      path: '/bitacora',
      session,
      before: (s) => s.respond(auditApi.list, { entries: [entry(3)], next: null }),
    });
    await screen.findByRole('row', { name: /^Corregir orden/ });
    await userEvent.type(screen.getByLabelText('DM u orden'), '0042');
    await waitFor(() => expect(audits(t).at(-1)!.query.get('ref')).toBe('0042'));
    await userEvent.selectOptions(screen.getByLabelText('Acción'), 'order');
    await waitFor(() => expect(audits(t).at(-1)!.query.get('group')).toBe('order'));

    const before = audits(t).length;
    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-14');
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-10-01');
    expect(await screen.findByText('«Hasta» no puede ser anterior a «desde».')).not.toBeNull();
    expect(audits(t).filter((c) => c.query.get('to') === '2026-10-01')).toEqual([]);
    expect(audits(t).length).toBeGreaterThanOrEqual(before);
  });

  it('«Cargar más» pide la página siguiente', async () => {
    const t = await renderScreen(<AuditScreen />, {
      path: '/bitacora',
      session,
      before: (s) =>
        s.respond(auditApi.list, (c: FakeCall) =>
          c.query.get('before')
            ? { entries: [entry(1, { action: 'order.issue' })], next: null }
            : { entries: [entry(3)], next: 3 },
        ),
    });
    await screen.findByRole('row', { name: /^Corregir orden/ });
    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByRole('row', { name: /^Emitir orden/ })).not.toBeNull();
    expect(audits(t).at(-1)!.query.get('before')).toBe('3');
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
  });

  it('sin conexión explica que se consulta en el servidor y no pide nada', async () => {
    const t = await renderScreen(<AuditScreen />, { path: '/bitacora', session, online: false, local: [] });
    expect(await screen.findByText('La bitácora se consulta en el servidor.')).not.toBeNull();
    expect(audits(t)).toEqual([]);
  });

  it('en teléfono, tarjetas', async () => {
    await renderScreen(<AuditScreen />, {
      path: '/bitacora',
      device: 'phone',
      session,
      before: (s) => s.respond(auditApi.list, { entries: [entry(3)], next: null }),
    });
    const card = await screen.findByRole('listitem', { name: /^Corregir orden/ });
    expect(card.textContent).toContain('Mario Delgado · Tel. patio');
  });
});

describe('antes → después', () => {
  it('solo lo que cambió, en palabras, sin los datos internos', () => {
    expect(
      changesOf(
        { tons: '17.280', rowVersion: 1, active: true, brand: 'Dosel' },
        { tons: '18.000', rowVersion: 2, active: false, brand: 'Dosel', extra: { a: 1 } },
      ),
    ).toEqual([
      { field: 'Toneladas', before: '17.280', after: '18.000' },
      { field: 'Activo', before: 'Sí', after: 'No' },
      { field: 'extra', before: '—', after: '{"a":1}' },
    ]);
    expect(changesOf(null, { name: 'Nuevos Tiempos' })).toEqual([
      { field: 'Nombre', before: '—', after: 'Nuevos Tiempos' },
    ]);
  });
});
