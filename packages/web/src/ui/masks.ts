// T024 · RF-VAL-07: ayudas de escritura. Solo dan forma a lo que se escribe; las reglas siguen en los esquemas compartidos.

/** Carné, licencia, número de DM y código de 6 dígitos: solo dígitos. */
export const maskDigits = (raw: string): string => raw.replace(/\D/g, '');

/** Chapas: en mayúsculas. */
export const maskUpper = (raw: string): string => raw.toUpperCase();

/** Teléfono: 8 dígitos, con el prefijo +53 opcional (el esquema lo quita al guardar). */
export function maskPhone(raw: string): string {
  const digits = maskDigits(raw);
  if (!raw.trimStart().startsWith('+')) return digits.slice(0, 8);
  const d = digits.slice(0, 10);
  return d.length > 2 ? `+${d.slice(0, 2)} ${d.slice(2)}` : `+${d}`;
}

/** Toneladas: dígitos y un solo separador decimal (coma o punto, se muestra coma), con 3 decimales como máximo. */
export function maskTons(raw: string): string {
  let out = '';
  let decimals = -1;
  for (const c of raw) {
    if (c >= '0' && c <= '9') {
      if (decimals >= 3) continue;
      out += c;
      if (decimals >= 0) decimals++;
    } else if ((c === ',' || c === '.') && decimals < 0) {
      out += ',';
      decimals = 0;
    }
  }
  return out;
}
