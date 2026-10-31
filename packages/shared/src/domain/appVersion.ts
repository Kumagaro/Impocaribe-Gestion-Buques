const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** DT-11: ¿la versión de la app está por debajo de la mínima compatible? Una versión mal formada se trata como antigua. */
export function isBelowMinVersion(version: string, minVersion: string): boolean {
  const v = SEMVER.exec(version);
  const m = SEMVER.exec(minVersion);
  if (!v || !m) return true;
  for (let i = 1; i <= 3; i++) {
    const diff = parseInt(v[i]!, 10) - parseInt(m[i]!, 10);
    if (diff !== 0) return diff < 0;
  }
  return false;
}

/** T113 · RF-UPD-02: ordena dos versiones semver bien formadas (negativo si `a` es anterior). */
export function compareVersions(a: string, b: string): number {
  const x = SEMVER.exec(a);
  const y = SEMVER.exec(b);
  if (!x || !y) throw new Error(`Versión mal formada: ${x ? b : a}`);
  for (let i = 1; i <= 3; i++) {
    const diff = parseInt(x[i]!, 10) - parseInt(y[i]!, 10);
    if (diff !== 0) return diff;
  }
  return 0;
}

export const isVersion = (v: string) => SEMVER.test(v);
