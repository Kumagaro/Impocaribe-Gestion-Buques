import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, deadlineAt, deadlineDay, deadlineText, lastDeadlineDate } from './deadline.ts';

// T060 · RF-PLZ-01 a 05 (oráculo: la tabla de RF-PLZ-01 y HU-09).
describe('RF-PLZ-01: la tabla de la spec', () => {
  it.each([
    ['2026-09-01', 1],
    ['2026-09-25', 25],
    ['2026-09-30', 30],
    ['2026-10-01', 31],
  ])('creada el 01/09: el %s es el día %i', (today, day) => {
    expect(deadlineDay('2026-09-01', today)).toBe(day);
  });

  it('el último día para emitir es el 30/09', () => {
    expect(lastDeadlineDate('2026-09-01')).toBe('2026-09-30');
  });
});

describe('en hora de La Habana (UTC−4 en verano, UTC−5 en invierno)', () => {
  it('HU-09: el 30/09 a las 23:59 aún vale; el 01/10 a las 00:00 vence', () => {
    // 23:59 en La Habana (UTC−4) es 03:59 UTC del día siguiente.
    expect(deadlineAt('2026-09-01', new Date('2026-10-01T03:59:59Z'))).toEqual({
      day: 30,
      warning: true,
      expired: false,
    });
    expect(deadlineAt('2026-09-01', new Date('2026-10-01T04:00:00Z'))).toEqual({
      day: 31,
      warning: false,
      expired: true,
    });
  });

  it('el día 24 no avisa; el 25 sí (RF-PLZ-02)', () => {
    expect(deadlineAt('2026-09-01', new Date('2026-09-24T15:00:00Z')).warning).toBe(false);
    expect(deadlineAt('2026-09-01', new Date('2026-09-25T15:00:00Z')).warning).toBe(true);
  });

  it('el cambio de horario de noviembre no salta ni repite días', () => {
    // 1 de noviembre de 2026: La Habana vuelve a UTC−5.
    expect(deadlineAt('2026-10-20', new Date('2026-11-01T04:30:00Z')).day).toBe(13);
    expect(deadlineAt('2026-10-20', new Date('2026-11-02T04:59:00Z')).day).toBe(13);
    expect(deadlineAt('2026-10-20', new Date('2026-11-02T05:00:00Z')).day).toBe(14);
  });

  it('el cambio de horario de marzo tampoco', () => {
    // 8 de marzo de 2026: La Habana pasa a UTC−4.
    expect(deadlineAt('2026-03-01', new Date('2026-03-08T04:30:00Z')).day).toBe(7);
    expect(deadlineAt('2026-03-01', new Date('2026-03-09T03:59:00Z')).day).toBe(8);
    expect(deadlineAt('2026-03-01', new Date('2026-03-09T04:00:00Z')).day).toBe(9);
  });
});

describe('fin de mes y de año', () => {
  it.each([
    ['2026-01-31', '2026-03-01'],
    ['2028-01-31', '2028-02-29'],
    ['2026-12-15', '2027-01-13'],
    ['2026-02-28', '2026-03-29'],
  ])('creada el %s, el último día es el %s', (start, last) => {
    expect(lastDeadlineDate(start)).toBe(last);
  });

  it('cruza el año: del 15/12 al 13/01 hay 30 días', () => {
    expect(deadlineDay('2026-12-15', '2027-01-13')).toBe(30);
    expect(deadlineDay('2026-12-15', '2027-01-14')).toBe(31);
  });
});

describe('texto y propiedades', () => {
  it('«n/30» y, pasado el plazo, «Vencido»', () => {
    expect(deadlineText(1)).toBe('1/30');
    expect(deadlineText(30)).toBe('30/30');
    expect(deadlineText(31)).toBe('Vencido');
  });

  it('una fecha mal escrita es un error, no un día cualquiera', () => {
    expect(() => deadlineDay('01/09/2026', '2026-09-02')).toThrow('no es una fecha AAAA-MM-DD');
  });

  it('el día de `addDays(inicio, n)` es n + 1 y sumar y restar se anulan', () => {
    const date = fc
      .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true })
      .map((d) => d.toISOString().slice(0, 10));
    fc.assert(
      fc.property(date, fc.integer({ min: -400, max: 400 }), (start, n) => {
        expect(deadlineDay(start, addDays(start, n))).toBe(n + 1);
        expect(addDays(addDays(start, n), -n)).toBe(start);
      }),
    );
  });
});
