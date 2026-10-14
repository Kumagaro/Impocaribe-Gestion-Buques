// ui-spec §6 F-02 y F-13, plan §7.7: el carné cubano empieza por la fecha de nacimiento AAMMDD. Si no la forma, se
// advierte (no bloquea): el siglo no se conoce, así que vale cualquier fecha posible en 19AA o 20AA.

export const NATIONAL_ID_DATE_WARNING = 'Revise el carné: no empieza por una fecha de nacimiento válida';

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** La advertencia de F-02/F-13, o null si los 6 primeros dígitos forman una fecha válida (o si no hay 6 dígitos). */
export function nationalIdDateWarning(nationalId: string): string | null {
  if (!/^\d{6}/.test(nationalId)) return null;
  const yy = parseInt(nationalId.slice(0, 2), 10);
  const mm = parseInt(nationalId.slice(2, 4), 10);
  const dd = parseInt(nationalId.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1) return NATIONAL_ID_DATE_WARNING;
  const leap = isLeap(1900 + yy) || isLeap(2000 + yy);
  const max = mm === 2 && leap ? 29 : DAYS[mm - 1]!;
  return dd > max ? NATIONAL_ID_DATE_WARNING : null;
}
