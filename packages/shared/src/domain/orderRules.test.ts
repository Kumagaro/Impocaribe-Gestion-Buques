import { describe, expect, it } from 'vitest';
import { checkOrder, type OrderCheckInput } from './orderRules.ts';
import { parseTons } from './tons.ts';

// T073 · RF-ORD-13, 17, RF-DM-07, 11, D3, D4, D5 (oráculo: la tabla de RF-ORD-13).
const t = parseTons;
const ESC = 'carrier-escambray';
const base: OrderCheckInput = {
  correction: null,
  today: '2026-08-29',
  maxLoadingDaysAhead: 7,
  hasOfficialSeal: true,
  declaration: { number: '00431', status: 'active' },
  vessel: { name: 'Eagle 1', status: 'open', arrivalDate: '2026-08-28' },
  allocationBalance: t('50'),
  tons: t('17.28'),
  loadingDate: '2026-08-30',
  recipient: { name: 'Almacén Central', active: true },
  truck: { plate: 'W011612', active: true, carrierId: ESC },
  driver: { fullName: 'Juan Carlos Miranda', active: true, carrierId: ESC },
  trailers: [{ plate: 'W006877', active: true, carrierId: ESC, capacity: t('30') }],
  sameDayOrders: 0,
  overrides: {},
};
const codes = (i: Partial<OrderCheckInput>) => checkOrder({ ...base, ...i }).map((p) => p.code);

describe('RF-ORD-13: emitir', () => {
  it('una orden correcta no tiene problemas', () => {
    expect(checkOrder(base)).toEqual([]);
  });

  it('sin firma o cuño oficial no se emite (RF-EMP-04)', () => {
    expect(codes({ hasOfficialSeal: false })).toEqual(['MISSING_OFFICIAL_SIGNATURE']);
  });

  it.each([
    ['pending_total', 'DECLARATION_PENDING_TOTAL'],
    ['expired', 'DECLARATION_EXPIRED'],
    ['closed', 'DECLARATION_CLOSED'],
  ] as const)('la DM %s bloquea', (status, code) => {
    expect(codes({ declaration: { number: '00431', status } })).toEqual([code]);
  });

  it('buque cerrado o sin arribo real bloquea', () => {
    expect(codes({ vessel: { name: 'Eagle 1', status: 'closed', arrivalDate: '2026-08-28' } })).toEqual([
      'VESSEL_CLOSED',
    ]);
    expect(codes({ vessel: { name: 'Eagle 1', status: 'open', arrivalDate: null } })).toEqual(['VESSEL_NOT_ARRIVED']);
  });

  it('D1: el saldo exacto pasa; 0,001 t más es sobregiro, con el mensaje exacto', () => {
    expect(codes({ tons: t('50'), trailers: [{ ...base.trailers[0]!, capacity: t('50') }] })).toEqual([]);
    const [p] = checkOrder({ ...base, tons: t('50.001'), trailers: [{ ...base.trailers[0]!, capacity: t('60') }] });
    expect(p).toEqual({
      code: 'OVERDRAFT_ALLOCATION',
      message: 'Esta orden pasa el saldo por 0,001 t. Quedan 50,000 t en la asignación.',
      field: 'tons',
      details: { availableTons: '50.000', excessTons: '0.001' },
    });
  });

  it('fecha de carga: desde hoy hasta hoy + N días', () => {
    expect(codes({ loadingDate: '2026-08-29' })).toEqual([]);
    expect(codes({ loadingDate: '2026-08-28' })).toEqual(['LOADING_DATE_BEFORE_ISSUE']);
    expect(codes({ loadingDate: '2026-09-05' })).toEqual([]);
    expect(codes({ loadingDate: '2026-09-06' })).toEqual(['LOADING_DATE_TOO_FAR']);
    expect(codes({ loadingDate: '2026-09-02', maxLoadingDaysAhead: 3 })).toEqual(['LOADING_DATE_TOO_FAR']);
  });

  it('chofer, camión, remolques y destinatario activos', () => {
    expect(
      codes({
        recipient: { ...base.recipient, active: false },
        truck: { ...base.truck, active: false },
        driver: { ...base.driver, active: false },
        trailers: [{ ...base.trailers[0]!, active: false }],
      }),
    ).toEqual(['INACTIVE_RESOURCE', 'INACTIVE_RESOURCE', 'INACTIVE_RESOURCE', 'INACTIVE_RESOURCE']);
  });

  it('chofer y remolques del transportista del camión', () => {
    expect(codes({ driver: { ...base.driver, carrierId: 'otro' } })).toEqual(['DRIVER_CARRIER_MISMATCH']);
    expect(codes({ trailers: [base.trailers[0]!, { ...base.trailers[0]!, plate: 'P1', carrierId: 'otro' }] })).toEqual([
      'TRAILER_CARRIER_MISMATCH',
    ]);
  });

  it('D4: la capacidad exacta pasa; pasarla pide excepción con motivo', () => {
    expect(codes({ tons: t('30') })).toEqual([]);
    const [p] = checkOrder({ ...base, tons: t('30.5') });
    expect(p).toMatchObject({
      code: 'CAPACITY_REQUIRES_OVERRIDE',
      details: { capacityTons: '30.000', excessTons: '0.500' },
    });
    expect(codes({ tons: t('30.5'), overrides: { capacity: 'Remolque reforzado, autorizado' } })).toEqual([]);
  });

  it('la capacidad es la suma de los remolques', () => {
    expect(
      codes({ tons: t('45'), trailers: [base.trailers[0]!, { ...base.trailers[0]!, plate: 'P2', capacity: t('15') }] }),
    ).toEqual([]);
  });

  it('D5: otra orden del camión el mismo día pide excepción', () => {
    expect(codes({ sameDayOrders: 1 })).toEqual(['SAME_DAY_REQUIRES_OVERRIDE']);
    expect(checkOrder({ ...base, sameDayOrders: 2 })[0]!.message).toBe(
      'El camión W011612 ya tiene 2 órdenes con esa fecha de carga.',
    );
    expect(codes({ sameDayOrders: 1, overrides: { sameDay: 'Segundo viaje del día' } })).toEqual([]);
  });
});

describe('RF-ORD-17: corregir', () => {
  const fix = { currentTons: t('17.28'), firstIssueDate: '2026-08-25' };

  it('el saldo cuenta lo que libera la versión vigente', () => {
    expect(codes({ correction: fix, allocationBalance: t('0'), tons: t('17.28') })).toEqual([]);
    expect(codes({ correction: fix, allocationBalance: t('1'), tons: t('18.28') })).toEqual([]);
    expect(codes({ correction: fix, allocationBalance: t('1'), tons: t('18.281') })).toEqual(['OVERDRAFT_ALLOCATION']);
  });

  it('la fecha de carga se compara con la emisión de la versión 1', () => {
    expect(codes({ correction: fix, loadingDate: '2026-08-25' })).toEqual([]);
    expect(codes({ correction: fix, loadingDate: '2026-08-24' })).toEqual(['LOADING_DATE_BEFORE_ISSUE']);
    expect(checkOrder({ ...base, correction: fix, loadingDate: '2026-08-24' })[0]!.message).toBe(
      'La fecha de carga no puede ser anterior a la emisión de la versión 1.',
    );
  });

  it('RF-DM-11: DM vencida o cerrada y buque cerrado no bloquean; vencida no admite más toneladas', () => {
    const closed = { name: 'Eagle 1', status: 'closed' as const, arrivalDate: '2026-08-28' };
    expect(codes({ correction: fix, declaration: { number: '00431', status: 'closed' }, vessel: closed })).toEqual([]);
    expect(codes({ correction: fix, declaration: { number: '00431', status: 'expired' }, tons: t('17.28') })).toEqual(
      [],
    );
    const [p] = checkOrder({
      ...base,
      correction: fix,
      declaration: { number: '00431', status: 'expired' },
      tons: t('17.281'),
    });
    expect(p).toEqual({
      code: 'EXPIRED_CANNOT_INCREASE',
      message: 'La DM 00431 está vencida: la corrección no puede pasar de 17,280 t.',
      field: 'tons',
      details: { maxTons: '17.280' },
    });
  });

  it('una DM pendiente de total bloquea también al corregir', () => {
    expect(codes({ correction: fix, declaration: { number: '00431', status: 'pending_total' } })).toEqual([
      'DECLARATION_PENDING_TOTAL',
    ]);
  });
});
