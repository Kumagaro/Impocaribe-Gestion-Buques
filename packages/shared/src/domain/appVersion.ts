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
