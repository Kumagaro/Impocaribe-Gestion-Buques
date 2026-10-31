// T060 · RF-PLZ-01 a 05, D7, plan §5.7: el plazo de 30 días naturales de una DM, en hora de La Habana. La fecha de
// creación (o la de la última reactivación) es el día 1; el día 25 se avisa (AL-03) y al empezar el día 31 vence.
import { havanaDate } from './clock.ts';

export const DEADLINE_DAYS = 30;
export const DEADLINE_WARNING_DAY = 25;

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Días de calendario como número, sin horas ni zonas: `YYYY-MM-DD` → días desde 1970-01-01. */
function epochDay(date: string): number {
  const m = ISO_DATE.exec(date);
  if (!m) throw new RangeError(`«${date}» no es una fecha AAAA-MM-DD.`);
  return Date.UTC(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10)) / DAY_MS;
}

/** `YYYY-MM-DD` desplazada `days` días de calendario. */
export function addDays(date: string, days: number): string {
  return new Date((epochDay(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Día del plazo en la fecha `today` (las dos `YYYY-MM-DD` de La Habana): el día de inicio es el 1. */
export function deadlineDay(startDate: string, today: string): number {
  return epochDay(today) - epochDay(startDate) + 1;
}

/** Último día para emitir (el 30). */
export function lastDeadlineDate(startDate: string): string {
  return addDays(startDate, DEADLINE_DAYS - 1);
}

/** El plazo de una DM en un instante, con la hora del servidor. */
export function deadlineAt(startDate: string, now: Date) {
  const day = deadlineDay(startDate, havanaDate(now));
  return {
    day,
    /** Desde el día 25: AL-03 y la barra en color de advertencia (RF-PLZ-02, 05). */
    warning: day >= DEADLINE_WARNING_DAY && day <= DEADLINE_DAYS,
    /** Al empezar el día 31 (RF-PLZ-03). */
    expired: day > DEADLINE_DAYS,
  };
}

/** «12/30» para las listas (ui-spec P-09); pasado el plazo, «Vencido». */
export function deadlineText(day: number): string {
  return day > DEADLINE_DAYS ? 'Vencido' : `${Math.max(day, 1)}/${DEADLINE_DAYS}`;
}
