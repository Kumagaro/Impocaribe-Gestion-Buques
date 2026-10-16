import { Decimal } from 'decimal.js';

/** Toneladas con aritmética decimal exacta (Const. art. V). Nunca `number`. */
export type Tons = Decimal & { readonly __tons: unique symbol };

export class TonsParseError extends Error {}

const SCALE = 3;
const TONS_TEXT = /^\d+(?:[.,](\d+))?$/;

/** Lee toneladas escritas con coma o punto decimal y como máximo 3 decimales (RF-VAL-07). */
export function parseTons(text: string): Tons {
  const clean = text.trim();
  const match = TONS_TEXT.exec(clean);
  if (!match) throw new TonsParseError(`«${clean}» no es una cantidad de toneladas válida.`);
  const decimals = match[1]?.length ?? 0;
  if (decimals > SCALE) {
    throw new TonsParseError(`Las toneladas admiten como máximo ${SCALE} decimales (tiene ${decimals}).`);
  }
  return new Decimal(clean.replace(',', '.')) as Tons;
}

export function addTons(...values: Tons[]): Tons {
  return values.reduce<Decimal>((sum, v) => sum.plus(v), new Decimal(0)) as Tons;
}

export function subTons(a: Tons, b: Tons): Tons {
  return a.minus(b) as Tons;
}

export function compareTons(a: Tons, b: Tons): -1 | 0 | 1 {
  return a.comparedTo(b) as -1 | 0 | 1;
}

/** Formato del contrato de API: cadena con punto y 3 decimales (`"17.280"`, plan §6). */
export function tonsToApi(t: Tons): string {
  return t.toFixed(SCALE);
}

/** Formato de pantalla: coma decimal, espacio de miles y 3 decimales (`1 234,500 t`, RNF-05). */
export function formatTons(t: Tons): string {
  const [int, frac] = t.abs().toFixed(SCALE).split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+$)/g, ' ');
  return `${t.isNegative() ? '-' : ''}${grouped},${frac} t`;
}
