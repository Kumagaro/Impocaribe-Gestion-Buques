// T061 · RF-BUQ-02 y RF-ORD-15: el código de numeración que se deriva del nombre del buque y el número de orden
// `{CÓDIGO}-{AÑO DE ARRIBO}-V{VIAJE}-{ID de 4 dígitos}`, reversible.

/** «Eagle 1» → `EAGLE1`: mayúsculas, sin tildes, espacios ni símbolos. */
export function vesselCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export interface OrderNumberParts {
  code: string;
  year: number;
  voyage: number;
  seq: number;
}

export function formatOrderNumber(p: OrderNumberParts): string {
  return `${p.code}-${p.year}-V${p.voyage}-${String(p.seq).padStart(4, '0')}`;
}

const ORDER_NUMBER = /^([A-Z0-9]+)-(\d{4})-V([1-9]\d*)-(\d{4,})$/;

/** El inverso de `formatOrderNumber`; null si el texto no es un número de orden. */
export function parseOrderNumber(text: string): OrderNumberParts | null {
  const m = ORDER_NUMBER.exec(text);
  if (!m) return null;
  const seq = parseInt(m[4]!, 10);
  if (seq < 1 || (m[4]!.length > 4 && m[4]!.startsWith('0'))) return null;
  return { code: m[1]!, year: parseInt(m[2]!, 10), voyage: parseInt(m[3]!, 10), seq };
}
