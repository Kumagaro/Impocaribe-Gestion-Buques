// T033: opciones HTTPS del servidor a partir de su identidad (DT-18). En producción son obligatorias (Const. art. X.2).
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../config.ts';
import { loadIdentity, type SecretProtector } from './identity.ts';

export interface TlsOptions {
  key: string;
  /** El certificado del servidor seguido de la CA: el cliente verifica la cadena entera (verifyServerChain). */
  cert: string;
}

export async function serverTls(
  cfg: { env: Environment; identityDir: string },
  protector: SecretProtector,
): Promise<TlsOptions | null> {
  const present = await stat(join(cfg.identityDir, 'identity.json')).then(
    () => true,
    () => false,
  );
  if (!present) {
    if (cfg.env === 'production')
      throw new Error(
        `Falta la identidad del servidor en ${cfg.identityDir}. Créela o repárela con el ayudante de instalación.`,
      );
    return null;
  }
  const identity = await loadIdentity(cfg.identityDir, protector);
  return { key: identity.keyPem, cert: identity.certPem + identity.caCertPem };
}
