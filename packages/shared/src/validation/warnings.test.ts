import { describe, expect, it } from 'vitest';
import { parseTons } from '../domain/tons.ts';
import {
  adv01,
  adv02,
  adv03,
  adv04,
  adv06,
  adv07,
  containerWarning,
  findSimilar,
  NATIONAL_ID_DATE_WARNING,
  nationalIdDateWarning,
} from './warnings.ts';

// T074 · RF-VAL-08: los límites exactos de la tarea, calculados a mano.
const t = parseTons;

describe('RF-VAL-08: ADV-01 a ADV-07', () => {
  it('ADV-01: días 24 y 25; el 31 ya es vencida, no aviso', () => {
    expect(adv01(24)).toBeUndefined();
    expect(adv01(25)).toBe('La DM está en el día 25 de 30 de su plazo.');
    expect(adv01(30)).toBe('La DM está en el día 30 de 30 de su plazo.');
    expect(adv01(31)).toBeUndefined();
  });

  it('ADV-02: quedarían 1,000 t (sin aviso) y 0,999 t (con aviso); 0 cierra; negativo es sobregiro', () => {
    expect(adv02(t('1'))).toBeUndefined();
    expect(adv02(t('0.999'))).toBe('Tras esta orden quedarían 0,999 t en la DM. ¿Cierra la DM con esta orden?');
    expect(adv02(t('0'))).toBe('Tras esta orden quedarían 0,000 t en la DM. ¿Cierra la DM con esta orden?');
    expect(adv02(t('0').minus('0.001') as never)).toBeUndefined();
  });

  it('ADV-03: 95 % exacto (sin aviso) y 95,001 % (con aviso); pasar la capacidad es otra regla', () => {
    expect(adv03(t('95'), t('100'))).toBeUndefined();
    expect(adv03(t('95.001'), t('100'))).toBe(
      'La orden ocupa más del 95 % de la capacidad de los remolques (100,000 t).',
    );
    expect(adv03(t('100'), t('100'))).toBe('La orden ocupa más del 95 % de la capacidad de los remolques (100,000 t).');
    expect(adv03(t('100.001'), t('100'))).toBeUndefined();
  });

  it('ADV-04: la fecha de carga distinta de hoy', () => {
    expect(adv04('2026-08-29', '2026-08-29')).toBeUndefined();
    expect(adv04('2026-08-30', '2026-08-29')).toBe('La fecha de carga no es hoy.');
  });

  it('ADV-06: 5 % libre (sin aviso) y 4,999 % (con aviso)', () => {
    expect(adv06(t('5'), t('100'))).toBeUndefined();
    expect(adv06(t('4.999'), t('100'))).toBe('Tras la asignación quedarían 4,999 t libres en el buque: menos del 5 %.');
    expect(adv06(t('0'), t('100'))).toBe('Tras la asignación quedarían 0,000 t libres en el buque: menos del 5 %.');
  });

  it('ADV-07: 3 órdenes del chofer (sin aviso) y 4 (con aviso)', () => {
    expect(adv07(3)).toBeUndefined();
    expect(adv07(4)).toBe('El chofer ya tiene 4 órdenes con esa fecha de carga.');
  });

  it('ADV-05 y el carné: las mismas funciones de siempre', () => {
    expect(nationalIdDateWarning('84011905548')).toBeNull();
    expect(nationalIdDateWarning('84133105548')).toBe(NATIONAL_ID_DATE_WARNING);
    expect(findSimilar('Transporte Escambray', [{ id: '1', name: 'Transportes Escambray' }]).similar).toHaveLength(1);
  });
});

describe('F-14: contenedor', () => {
  it.each([
    ['', undefined],
    ['MSCU1234567', undefined],
    ['MSCU123456', 'No parece un número de contenedor estándar'],
    ['MSC1234567', 'No parece un número de contenedor estándar'],
  ])('«%s»', (container, warning) => {
    expect(containerWarning(container)).toBe(warning);
  });
});
