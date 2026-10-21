import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatOrderNumber, parseOrderNumber, vesselCode } from './numbering.ts';

// T061 · RF-BUQ-02 y RF-ORD-15.
describe('RF-BUQ-02: código del buque', () => {
  it.each([
    ['Eagle 1', 'EAGLE1'],
    ['  sea-star ii ', 'SEASTARII'],
    ['Nuñez Ávila', 'NUNEZAVILA'],
    ['M/V Ocean Pride 3', 'MVOCEANPRIDE3'],
  ])('«%s» → %s', (name, code) => {
    expect(vesselCode(name)).toBe(code);
  });
});

describe('RF-ORD-15: número de orden', () => {
  it('EAGLE1-2026-V1-0001', () => {
    expect(formatOrderNumber({ code: 'EAGLE1', year: 2026, voyage: 1, seq: 1 })).toBe('EAGLE1-2026-V1-0001');
    expect(formatOrderNumber({ code: 'EAGLE1', year: 2026, voyage: 2, seq: 42 })).toBe('EAGLE1-2026-V2-0042');
  });

  it('pasado el 9999 sigue sin ceros de relleno', () => {
    expect(formatOrderNumber({ code: 'X1', year: 2027, voyage: 3, seq: 10000 })).toBe('X1-2027-V3-10000');
  });

  it.each([
    'EAGLE1-2026-V1-001',
    'eagle1-2026-V1-0001',
    'EAGLE1-26-V1-0001',
    'EAGLE1-2026-V0-0001',
    'EAGLE1-2026-V1-0000',
    'EAGLE1-2026-V1-00001',
  ])('«%s» no es un número de orden', (text) => {
    expect(parseOrderNumber(text)).toBeNull();
  });

  it('es reversible (plan §11.2)', () => {
    const parts = fc.record({
      code: fc.stringMatching(/^[A-Z0-9]{1,12}$/),
      year: fc.integer({ min: 2000, max: 2999 }),
      voyage: fc.integer({ min: 1, max: 99 }),
      seq: fc.integer({ min: 1, max: 999_999 }),
    });
    fc.assert(
      fc.property(parts, (p) => {
        expect(parseOrderNumber(formatOrderNumber(p))).toEqual(p);
      }),
    );
  });
});
