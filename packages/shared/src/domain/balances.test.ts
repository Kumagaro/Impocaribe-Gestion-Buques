import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allocationBalance,
  declarationBalances,
  declarationStatus,
  isPendingDeclaration,
  vesselBalances,
  type AllocationAmounts,
} from './balances.ts';
import { addTons, parseTons, tonsToApi, type Tons } from './tons.ts';

// T060 · spec §6, RF-DM-06, 10, RF-BUQ-06 y 08.
const t = (s: string) => parseTons(s);
const a = (allocated: string, loaded = '0'): AllocationAmounts => ({ allocated: t(allocated), loaded: t(loaded) });
const api = (x: Tons | null) => (x ? tonsToApi(x) : null);

describe('spec §6: saldos', () => {
  it('asignación: asignado − cargado (RF-ASG-04)', () => {
    expect(api(allocationBalance(a('50', '17.28')))).toBe('32.720');
  });

  it('DM con dos buques', () => {
    const d = declarationBalances(t('80'), [a('50', '20'), a('20', '5.5')]);
    expect([d.allocated, d.loaded, d.balance, d.pendingAllocation].map(api)).toEqual([
      '70.000',
      '25.500',
      '54.500',
      '10.000',
    ]);
    expect(d.progress).toBe('31,9');
  });

  it('DM sin total: sin saldo ni pendiente, avance 0', () => {
    const d = declarationBalances(null, []);
    expect([d.balance, d.pendingAllocation, d.progress]).toEqual([null, null, '0,0']);
  });

  it('buque: libre, restante y sobrante (RF-BUQ-06 y 08)', () => {
    const v = vesselBalances({
      total: t('100'),
      allocations: [a('50', '40'), a('30', '30')],
      disposedOut: t('5'),
      allocatedAsDisposition: t('3'),
    });
    expect([v.allocated, v.loaded, v.free, v.remaining, v.surplus, v.unresolved].map(api)).toEqual([
      '80.000',
      '70.000',
      '15.000',
      '30.000',
      '25.000',
      '22.000',
    ]);
  });

  it('nunca pierde un milésimo: 0,001 t sin destino no se redondea a 0', () => {
    const v = vesselBalances({
      total: t('100'),
      allocations: [a('99.999', '99.999')],
      disposedOut: t('0'),
      allocatedAsDisposition: t('0'),
    });
    expect(api(v.unresolved)).toBe('0.001');
  });
});

describe('RF-DM-06: el estado en el orden de la tabla', () => {
  it.each([
    ['cargado = total, aunque esté vencida → Cerrada', t('30'), [a('30', '30')], true, 'closed'],
    ['vencida con saldo → Vencida', t('30'), [a('30', '10')], true, 'expired'],
    ['vencida sin total → Vencida', null, [], true, 'expired'],
    ['sin total → Pendiente de total', null, [], false, 'pending_total'],
    ['con saldo asignado → Activa', t('80'), [a('50', '10')], false, 'active'],
    [
      'asignado todo cargado, falta asignar → Pendiente de asignación',
      t('80'),
      [a('50', '50')],
      false,
      'pending_allocation',
    ],
    ['con total y sin asignaciones → Pendiente de asignación', t('80'), [], false, 'pending_allocation'],
  ] as const)('%s', (_, total, allocations, expired, status) => {
    expect(declarationStatus({ total, allocations: [...allocations], expired })).toBe(status);
  });

  it('una DM de 0,000 t cargada en 0 no está cerrada por accidente: no hay total 0 en F-08', () => {
    expect(declarationStatus({ total: t('0.001'), allocations: [], expired: false })).toBe('pending_allocation');
  });
});

describe('RF-DM-10: DM pendiente', () => {
  it.each([
    ['sin total', null, [], false, true],
    ['activa con toneladas sin asignar', t('80'), [a('50')], false, true],
    ['toda asignada', t('80'), [a('80')], false, false],
    ['vencida', t('80'), [a('50')], true, false],
    ['cerrada', t('50'), [a('50', '50')], false, false],
  ] as const)('%s', (_, total, allocations, expired, pending) => {
    expect(isPendingDeclaration({ total, allocations: [...allocations], expired })).toBe(pending);
  });
});

describe('propiedades', () => {
  const tons = fc.integer({ min: 0, max: 10_000_000 }).map((n) => t((n / 1000).toFixed(3)));
  it('saldo = asignado − cargado, y la suma por DM coincide con la de sus asignaciones', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(tons, tons), { maxLength: 6 }), (pairs) => {
        const allocations = pairs.map(([x, y]) => ({ allocated: x, loaded: y }));
        const d = declarationBalances(t('1'), allocations);
        const sum = addTons(...allocations.map(allocationBalance));
        expect(d.allocated.minus(d.loaded).equals(sum)).toBe(true);
      }),
    );
  });

  it('en un buque, libre + asignado + lo que salió = total, y restante = libre + asignado no cargado + salido', () => {
    fc.assert(
      fc.property(tons, fc.array(fc.tuple(tons, tons), { maxLength: 6 }), tons, (total, pairs, out) => {
        const v = vesselBalances({
          total,
          allocations: pairs.map(([x, y]) => ({ allocated: x, loaded: y })),
          disposedOut: out,
          allocatedAsDisposition: t('0'),
        });
        expect(v.free.plus(v.allocated).plus(out).equals(total)).toBe(true);
        expect(v.free.plus(v.allocated.minus(v.loaded)).plus(out).equals(v.remaining)).toBe(true);
      }),
    );
  });
});
