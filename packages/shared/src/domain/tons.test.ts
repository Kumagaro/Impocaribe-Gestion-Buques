import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addTons, compareTons, formatTons, parseTons, subTons, tonsToApi, TonsParseError } from './tons.ts';

// T008 · Const. art. V (tonelada con 3 decimales, aritmética exacta) y RNF-05 (coma decimal, `17,280 t`).

describe('Const. art. V: aritmética exacta', () => {
  it('0,1 + 0,2 = 0,300', () => {
    const sum = addTons(parseTons('0,1'), parseTons('0,2'));
    expect(formatTons(sum)).toBe('0,300 t');
    expect(tonsToApi(sum)).toBe('0.300');
  });

  it('suma varias cantidades', () => {
    expect(tonsToApi(addTons(parseTons('17,280'), parseTons('34.000'), parseTons('0,001')))).toBe('51.281');
  });

  it('sin argumentos la suma es 0,000', () => {
    expect(tonsToApi(addTons())).toBe('0.000');
  });

  it('resta hasta exactamente 0,000', () => {
    expect(tonsToApi(subTons(parseTons('17,280'), parseTons('17.28')))).toBe('0.000');
  });

  it('una resta que pasa de cero da negativo (lo decide quien valida el saldo)', () => {
    expect(tonsToApi(subTons(parseTons('10'), parseTons('17,280')))).toBe('-7.280');
  });

  it('propiedad: (a + b) − b = a', () => {
    const milli = fc.integer({ min: 0, max: 999_999_999_999 });
    fc.assert(
      fc.property(milli, milli, (a, b) => {
        const ta = parseTons(fromMilli(a));
        const tb = parseTons(fromMilli(b));
        return compareTons(subTons(addTons(ta, tb), tb), ta) === 0;
      }),
      { numRuns: 2000 },
    );
  });
});

describe('parseTons (RF-VAL-07: coma o punto, como máximo 3 decimales)', () => {
  it.each([
    ['17,280', '17.280'],
    ['17.280', '17.280'],
    ['17', '17.000'],
    ['17,2', '17.200'],
    [' 0,001 ', '0.001'],
    ['999999,999', '999999.999'],
  ])('lee «%s» como %s', (text, api) => {
    expect(tonsToApi(parseTons(text))).toBe(api);
  });

  it('rechaza 4 decimales', () => {
    expect(() => parseTons('1,2345')).toThrow(
      new TonsParseError('Las toneladas admiten como máximo 3 decimales (tiene 4).'),
    );
  });

  it.each(['', 'abc', '-1', '1.2.3', ',5', '1,', '1e3', '17,280 t'])('rechaza «%s»', (text) => {
    expect(() => parseTons(text)).toThrow(
      new TonsParseError(`«${text.trim()}» no es una cantidad de toneladas válida.`),
    );
  });
});

describe('formatTons (RNF-05: coma decimal, espacio de miles, 3 decimales)', () => {
  it.each([
    ['1234.5', '1 234,500 t'],
    ['1234567.891', '1 234 567,891 t'],
    ['999', '999,000 t'],
    ['1000', '1 000,000 t'],
    ['0', '0,000 t'],
    ['17.28', '17,280 t'],
  ])('%s → %s', (api, text) => {
    expect(formatTons(parseTons(api))).toBe(text);
  });

  it('formatea negativos con signo', () => {
    expect(formatTons(subTons(parseTons('10'), parseTons('1017,280')))).toBe('-1 007,280 t');
  });
});

describe('compareTons', () => {
  it.each([
    ['17,280', '17.28', 0],
    ['17,281', '17,280', 1],
    ['0,999', '1', -1],
  ] as const)('compara %s con %s → %d', (a, b, expected) => {
    expect(compareTons(parseTons(a), parseTons(b))).toBe(expected);
  });
});

function fromMilli(m: number): string {
  const s = String(m).padStart(4, '0');
  return `${s.slice(0, -3)}.${s.slice(-3)}`;
}
