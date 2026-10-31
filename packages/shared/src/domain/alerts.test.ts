import { describe, expect, it } from 'vitest';
import { ALERT_TYPES, ALERTS, attendsAlert, seesAlert, SERVER_ALERT_TYPES } from './alerts.ts';

// T092 · spec §5.13 (tabla AL), RF-ALR-03 y 05.
describe('catálogo de alertas', () => {
  it('las solo locales no las guarda el servidor', () => {
    expect(ALERT_TYPES.filter((t) => !SERVER_ALERT_TYPES.includes(t))).toEqual(['AL-13', 'AL-14', 'AL-15']);
  });

  it('solo las de evento se atienden', () => {
    expect(ALERT_TYPES.filter((t) => ALERTS[t].attend.length > 0)).toEqual(
      ALERT_TYPES.filter((t) => ALERTS[t].kind === 'event'),
    );
  });

  it.each([
    ['AL-05', 'apoderada', true],
    ['AL-05', 'operador', false],
    ['AL-02', 'operador', true],
    ['AL-02', 'lectura', false],
    ['AL-01', 'lectura', true],
  ] as const)('%s la ve %s: %s', (type, role, expected) => {
    expect(seesAlert(type, role)).toBe(expected);
  });

  it('AL-08 la ve además su autor, sea cual sea su rol', () => {
    expect([seesAlert('AL-08', 'operador'), seesAlert('AL-08', 'operador', true)]).toEqual([false, true]);
  });

  it.each([
    ['AL-04', 'operador', true],
    ['AL-04', 'lectura', false],
    ['AL-11', 'apoderada', true],
    ['AL-11', 'operador', false],
    ['AL-01', 'apoderada', false],
  ] as const)('%s la atiende %s: %s', (type, role, expected) => {
    expect(attendsAlert(type, role)).toBe(expected);
  });
});
