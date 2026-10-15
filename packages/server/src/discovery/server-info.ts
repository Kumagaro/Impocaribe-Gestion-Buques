// La identidad pública del servidor (sin claves): la de identity.json más la versión del servidor. null si aún no hay
// identidad (solo en desarrollo y pruebas: en producción el servidor no arranca sin ella, T033).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import type { ServerInfo } from './discovery.controller.ts';

export const SERVER_VERSION: string = pkg.version;

export async function readServerInfo(identityDir: string): Promise<ServerInfo | null> {
  const raw = await readFile(join(identityDir, 'identity.json'), 'utf8').catch(() => null);
  if (raw === null) return null;
  const meta = JSON.parse(raw) as { serverId: string; name: string; caFingerprint: string };
  return { serverId: meta.serverId, name: meta.name, caFingerprint: meta.caFingerprint, version: SERVER_VERSION };
}
