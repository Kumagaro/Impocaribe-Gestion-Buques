import { describe, expect, it } from 'vitest';
import { havanaDate, isClockSkewed, ManualClock, systemClock } from './clock.ts';

// T010 · plan §11.4 (reloj controlado), Const. §6.3 (zona America/Havana) y RF-CON-10 (desfase de más de 5 minutos).

describe('havanaDate: fecha de negocio en America/Havana', () => {
  it.each([
    // Octubre: horario de verano de Cuba, UTC−4
    ['2026-10-14T03:59:59.999Z', '2026-10-13'],
    ['2026-10-14T04:00:00.000Z', '2026-10-14'],
    // Enero: horario normal, UTC−5
    ['2026-01-15T04:59:59.999Z', '2026-01-14'],
    ['2026-01-15T05:00:00.000Z', '2026-01-15'],
    // Fin de año
    ['2027-01-01T04:59:59.999Z', '2026-12-31'],
    ['2027-01-01T05:00:00.000Z', '2027-01-01'],
    // Cambio de horario: el 8 de marzo de 2026 las 00:00 pasan a ser 01:00
    ['2026-03-08T04:59:59.999Z', '2026-03-07'],
    ['2026-03-08T05:00:00.000Z', '2026-03-08'],
  ])('%s → %s', (instant, date) => {
    expect(havanaDate(new Date(instant))).toBe(date);
  });
});

describe('RF-CON-10: desfase de hora entre dispositivo y servidor', () => {
  const server = new Date('2026-10-14T12:00:00.000Z');
  it.each([
    ['5 min exactos por delante', '2026-10-14T12:05:00.000Z', false],
    ['5 min exactos por detrás', '2026-10-14T11:55:00.000Z', false],
    ['5 min y 1 ms por delante', '2026-10-14T12:05:00.001Z', true],
    ['5 min y 1 ms por detrás', '2026-10-14T11:54:59.999Z', true],
    ['misma hora', '2026-10-14T12:00:00.000Z', false],
  ])('%s → %s', (_name, device, skewed) => {
    expect(isClockSkewed(new Date(device), server)).toBe(skewed);
  });
});

describe('ManualClock (plan §11.4)', () => {
  it('devuelve la hora fijada y avanza a mano', () => {
    const clock = new ManualClock('2026-10-14T12:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-10-14T12:00:00.000Z');
    clock.advance(90_000);
    expect(clock.now().toISOString()).toBe('2026-10-14T12:01:30.000Z');
    clock.set('2026-11-01T00:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('now() devuelve una copia que no altera el reloj', () => {
    const clock = new ManualClock('2026-10-14T12:00:00.000Z');
    clock.now().setUTCFullYear(2000);
    expect(clock.now().toISOString()).toBe('2026-10-14T12:00:00.000Z');
  });
});

describe('systemClock', () => {
  it('devuelve la hora del sistema', () => {
    const before = Date.now();
    const t = systemClock.now().getTime();
    expect(t >= before && t <= Date.now()).toBe(true);
  });
});
