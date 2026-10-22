// T074 · RF-VAL-08, RF-DM-13: las advertencias de negocio (ADV-01 a ADV-07), que avisan sin bloquear, y en un solo
// lugar las que ya existían (el carné con fecha imposible y el nombre parecido; el aviso legal está en F06). Las mismas
// en la interfaz y en el servidor (DT-25).
import { DEADLINE_DAYS, DEADLINE_WARNING_DAY } from '../domain/deadline.ts';
import { compareTons, formatTons, parseTons, type Tons } from '../domain/tons.ts';

export { NATIONAL_ID_DATE_WARNING, nationalIdDateWarning } from '../domain/nationalId.ts';
export { findSimilar } from '../domain/names.ts';

const ONE_TON = parseTons('1');
const ZERO = parseTons('0');

/** ADV-01: la DM está en el día 25 o más de su plazo (y aún no venció). */
export function adv01(day: number): string | undefined {
  return day >= DEADLINE_WARNING_DAY && day <= DEADLINE_DAYS
    ? `La DM está en el día ${day} de ${DEADLINE_DAYS} de su plazo.`
    : undefined;
}

/** ADV-02: tras la orden quedarían menos de 1,000 t en la DM. */
export function adv02(declarationBalanceAfter: Tons): string | undefined {
  return compareTons(declarationBalanceAfter, ZERO) >= 0 && compareTons(declarationBalanceAfter, ONE_TON) < 0
    ? `Tras esta orden quedarían ${formatTons(declarationBalanceAfter)} en la DM. ¿Cierra la DM con esta orden?`
    : undefined;
}

/** ADV-03: la orden supera el 95 % de la capacidad de los remolques, sin pasarla. */
export function adv03(tons: Tons, capacity: Tons): string | undefined {
  const limit = capacity.times('0.95');
  return tons.greaterThan(limit) && compareTons(tons, capacity) <= 0
    ? `La orden ocupa más del 95 % de la capacidad de los remolques (${formatTons(capacity)}).`
    : undefined;
}

/** ADV-04: la fecha de carga es distinta de hoy. */
export function adv04(loadingDate: string, today: string): string | undefined {
  return loadingDate !== today ? 'La fecha de carga no es hoy.' : undefined;
}

/** ADV-06: tras la asignación quedaría menos del 5 % libre en el buque. */
export function adv06(freeAfter: Tons, vesselTotal: Tons): string | undefined {
  return compareTons(freeAfter, ZERO) >= 0 && freeAfter.lessThan(vesselTotal.times('0.05'))
    ? `Tras la asignación quedarían ${formatTons(freeAfter)} libres en el buque: menos del 5 %.`
    : undefined;
}

/** ADV-07: el chofer ya tiene más de 3 órdenes con esa fecha de carga (sin contar esta). */
export function adv07(driverOrdersThatDay: number): string | undefined {
  return driverOrdersThatDay > 3
    ? `El chofer ya tiene ${driverOrdersThatDay} órdenes con esa fecha de carga.`
    : undefined;
}

/** F-14: el contenedor no tiene la forma estándar de 4 letras y 7 dígitos (avisa, no bloquea). */
export function containerWarning(container: string): string | undefined {
  return container !== '' && !/^[A-Z]{4}\d{7}$/.test(container)
    ? 'No parece un número de contenedor estándar'
    : undefined;
}
