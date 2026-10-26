// T117 · RF-UPD-05 y plan §10.1: la actualización del instalador ligero. Se descarga del servidor emparejado por el
// transporte que verifica su identidad (DT-18), con su progreso; se comprueba el SHA-256 publicado (T113) y solo
// entonces se ejecuta el instalador, que pide la confirmación del usuario. Un archivo que no coincide se borra.
import { identityAgent } from '@impocaribe/shared/node';
import type { NativeServer } from '@impocaribe/shared';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { request } from 'node:https';
import { dirname, join } from 'node:path';

export class UpdateError extends Error {}

const VERSION = /^\d+\.\d+\.\d+$/;

/** Dónde queda el instalador descargado: un nombre fijo por versión, nunca uno que venga del servidor. */
export function installerPath(dir: string, version: string): string {
  if (!VERSION.test(version)) throw new UpdateError(`Versión no válida: ${version}`);
  return join(dir, `impocaribe-${version}.exe`);
}

/** Descarga `url` a `file` comprobando la identidad del servidor y la huella; devuelve la ruta del instalador. */
export function downloadUpdate(
  url: string,
  server: NativeServer,
  sha256: string,
  file: string,
  onProgress: (received: number, total: number) => void = () => undefined,
  now: () => Date = () => new Date(),
): Promise<string> {
  const part = `${file}.part`;
  return mkdir(dirname(file), { recursive: true }).then(
    () =>
      new Promise<string>((resolve, reject) => {
        const agent = identityAgent({ identity: server.serverId, caFingerprint: server.caFingerprint }, now);
        const req = request(url, { method: 'GET', agent }, (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(new UpdateError(`El servidor no entregó la actualización (estado ${res.statusCode}).`));
            return;
          }
          const total = Number(res.headers['content-length'] ?? 0);
          const hash = createHash('sha256');
          const out = createWriteStream(part);
          let received = 0;
          res.on('data', (chunk: Buffer) => {
            hash.update(chunk);
            received += chunk.length;
            onProgress(received, total);
          });
          res.pipe(out);
          out.on('error', reject);
          out.on('finish', () => {
            if (hash.digest('hex') !== sha256.toLowerCase()) {
              void rm(part, { force: true }).then(() =>
                reject(new UpdateError('El archivo descargado no coincide con el publicado: no se instala.')),
              );
              return;
            }
            rename(part, file).then(() => resolve(file), reject);
          });
        });
        req.on('error', (err) => void rm(part, { force: true }).then(() => reject(err)));
        req.end();
      }),
  );
}
