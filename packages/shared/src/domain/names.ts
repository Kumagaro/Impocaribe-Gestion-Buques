// T055 · RF-CAT-01 y 08, ADV-05, plan §4.2 (Catálogos): cómo se comparan nombres y chapas. Los usan la interfaz
// (contra la copia local, mientras se escribe) y el servidor (la unicidad), igual en los dos (DT-25).

/** Mayúsculas, sin acentos ni puntuación y sin espacios repetidos: «Nuevos Tiempos S.R.L.» → «NUEVOS TIEMPOS SRL». */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[\s-]+/g, ' ')
    .trim();
}

/** Chapas: mayúsculas, sin espacios ni guiones: «w 011 612» → «W011612». */
export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[\s-]+/g, '');
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * ADV-05: distintos al normalizar pero a pocas letras de distancia (una por cada 7 caracteres, al menos una). Así
 * «Nuevos Tiempos» y «Nuevo Tiempo» se avisan, y «Nuevos Tiempos» y «Viejos Tiempos», no.
 */
export function similarNames(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x === '' || y === '' || x === y) return false;
  return distance(x, y) <= Math.max(1, Math.floor(Math.max(x.length, y.length) / 7));
}

/** El registro con el mismo nombre (bloquea) y los parecidos (avisan), sin contar el que se está editando. */
export function findSimilar<T extends { id: string; name: string }>(
  name: string,
  items: readonly T[],
  selfId?: string,
) {
  const key = normalizeName(name);
  const others = key === '' ? [] : items.filter((i) => i.id !== selfId);
  return {
    same: others.find((i) => normalizeName(i.name) === key),
    similar: others.filter((i) => similarNames(i.name, name)),
  };
}
