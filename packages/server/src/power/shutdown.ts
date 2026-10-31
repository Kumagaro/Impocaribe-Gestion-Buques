// T132 · RF-ENE-04, 05 y plan §10.6: al 5 % de batería el servidor se detiene de forma ordenada. Ya está en modo
// protegido (no entra ninguna escritura y lo escrito está en disco): se detiene PostgreSQL (el ayudante lo registra con
// apagado rápido) y después el propio servicio. Los dos quedan en arranque automático: al encender la PC, arrancan solos.
// Los nombres de los servicios los pone el ayudante (T126) en el entorno del servicio.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Logger } from '@nestjs/common';

const run = promisify(execFile);
const log = new Logger('Power');

export async function stopServer(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const database = env.IMPOCARIBE_PG_SERVICE;
  const server = env.IMPOCARIBE_SERVICE;
  if (!database || !server) {
    log.warn('Sin los servicios del ayudante (desarrollo): el servidor no se detiene.');
    return;
  }
  await run('sc.exe', ['stop', database], { windowsHide: true }).catch((err: unknown) =>
    log.error(`No se pudo detener la base de datos: ${String(err)}`),
  );
  await run('sc.exe', ['stop', server], { windowsHide: true });
}
