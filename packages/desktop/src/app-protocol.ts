import { join, relative, isAbsolute } from 'node:path';

export const APP_ORIGIN = 'app://impocaribe';

/** Traduce una URL app://impocaribe/… a un archivo dentro de `root`, o null si sale de él (DT-02). */
export function resolveAppFile(url: string, root: string): string | null {
  const { host, pathname } = new URL(url);
  if (host !== 'impocaribe') return null;
  const file = join(root, decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  const rel = relative(root, file);
  return rel.startsWith('..') || isAbsolute(rel) ? null : file;
}
