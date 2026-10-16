import { describe, expect, it } from 'vitest';
import { nationalIdDateWarning, NATIONAL_ID_DATE_WARNING } from './nationalId.ts';

// ui-spec §6 F-02 y F-13, plan §7.7: si los 6 primeros dígitos no forman una fecha AAMMDD válida, se advierte (no bloquea).
// Los ejemplos de T074 (84011905548 sin advertencia, 84133105548 con advertencia) y los límites de cada mes.
describe('nationalIdDateWarning', () => {
  it.each([
    ['84011905548', null], // 19/01/1984
    ['84133105548', NATIONAL_ID_DATE_WARNING], // mes 13
    ['84003105548', NATIONAL_ID_DATE_WARNING], // mes 00
    ['84010005548', NATIONAL_ID_DATE_WARNING], // día 00
    ['84013105548', null], // 31 de enero
    ['84043105548', NATIONAL_ID_DATE_WARNING], // 31 de abril
    ['84043005548', null], // 30 de abril
    ['84022905548', null], // 29/02/1984, bisiesto
    ['85022905548', NATIONAL_ID_DATE_WARNING], // 29/02 de 1985 y 2085, no bisiestos
    ['00022905548', null], // 29/02/2000, bisiesto
    ['84023005548', NATIONAL_ID_DATE_WARNING], // 30 de febrero
    ['84123105548', null], // 31 de diciembre
  ])('%s → %s', (id, expected) => {
    expect(nationalIdDateWarning(id)).toBe(expected);
  });

  it('el texto es el del catálogo de campos', () => {
    expect(NATIONAL_ID_DATE_WARNING).toBe('Revise el carné: no empieza por una fecha de nacimiento válida');
  });

  it('sin 6 dígitos al principio no advierte: de eso se encarga el error de formato', () => {
    expect([nationalIdDateWarning('8401'), nationalIdDateWarning('84a11905548')]).toEqual([null, null]);
  });
});
