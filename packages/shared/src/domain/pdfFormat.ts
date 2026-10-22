// T077 · RF-PDF-01, plan §8.1: los formatos del documento actual de Impocaribe, distintos de los de pantalla
// (`tons.ts`): fecha de emisión `dd.mm.aaaa`, fecha de carga `dd/mm/aaaa` y toneladas con punto decimal, 3 decimales
// y espacio como separador de miles.
import type { Tons } from './tons.ts';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: string): [string, string, string] {
  const m = ISO_DATE.exec(date);
  if (!m) throw new RangeError(`«${date}» no es una fecha AAAA-MM-DD.`);
  return [m[3]!, m[2]!, m[1]!];
}

/** Fecha de emisión: `29.08.2026`. */
export function pdfIssueDate(date: string): string {
  return parts(date).join('.');
}

/** Fecha de carga («el día»): `30/08/2026`. */
export function pdfLoadingDate(date: string): string {
  return parts(date).join('/');
}

/** Peso bruto: `17.280`, `1 125.000`. */
export function pdfTons(t: Tons): string {
  const [int, frac] = t.toFixed(3).split('.');
  return `${int!.replace(/\B(?=(\d{3})+$)/g, ' ')}.${frac}`;
}
