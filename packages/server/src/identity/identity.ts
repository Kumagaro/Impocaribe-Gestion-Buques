// T033 · DT-18, DT-26 y RF-RED-03: identidad del servidor. Un UUID y su nombre corto IMPOCARIBE-XXXX, una CA propia de
// la instalación y un certificado cuyo único nombre es `<uuid>.impocaribe`: nunca una IP, para que el servidor siga
// siendo el mismo aunque cambie su dirección. Las apps aprenden la huella de la CA al emparejarse.
// @peculiar/x509 usa tsyringe, que necesita los metadatos de reflexión (los mismos que NestJS).
import 'reflect-metadata';
import { serverName, type Clock } from '@impocaribe/shared';
import * as x509 from '@peculiar/x509';
import { randomBytes, randomUUID, webcrypto, X509Certificate } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

x509.cryptoProvider.set(webcrypto as unknown as Crypto);

/** Cifra y descifra los secretos en disco: en producción, la protección de datos de Windows (protector.ts). */
export interface SecretProtector {
  protect(data: Buffer): Promise<Buffer>;
  unprotect(data: Buffer): Promise<Buffer>;
}

export interface ServerIdentity {
  serverId: string;
  /** Nombre que ven las personas al emparejar: IMPOCARIBE- y los 4 primeros caracteres del UUID. */
  name: string;
  /** Huella SHA-256 de la CA, en el formato de X509Certificate.fingerprint256. */
  caFingerprint: string;
  caCertPem: string;
  certPem: string;
  /** Clave privada del certificado del servidor (PKCS#8), para servir HTTPS. */
  keyPem: string;
}

export class IdentityExistsError extends Error {}

const ALG = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const;
/** Vida útil: la de la instalación. Sin internet no hay renovación automática que valga la pena. */
const VALID_YEARS = 30;
const FILES = {
  meta: 'identity.json',
  ca: 'ca.crt',
  cert: 'server.crt',
  caKey: 'ca.key.protected',
  key: 'server.key.protected',
} as const;

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );
const serial = () =>
  randomBytes(16)
    .toString('hex')
    .replace(/^[89a-f]/, '1');

async function pkcs8Pem(key: CryptoKey): Promise<string> {
  const der = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', key));
  const body = der
    .toString('base64')
    .match(/.{1,64}/g)!
    .join('\n');
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

/**
 * Crea la identidad en `dir`. Si ya hay una, solo la reemplaza el ayudante de instalación de forma explícita, y la
 * anterior se conserva aparte: regenerar la identidad deja huérfanos a todos los dispositivos emparejados.
 */
export async function createIdentity(
  dir: string,
  options: { protector: SecretProtector; clock: Clock; replaceByInstaller?: boolean },
): Promise<ServerIdentity> {
  const now = options.clock.now();
  if (await exists(join(dir, FILES.meta))) {
    if (!options.replaceByInstaller) {
      const current = JSON.parse(await readFile(join(dir, FILES.meta), 'utf8')) as { name: string };
      throw new IdentityExistsError(
        `Ya existe la identidad del servidor ${current.name}. Solo el ayudante de instalación puede reemplazarla.`,
      );
    }
    const stamp = now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
    await rename(dir, join(dirname(dir), `identity.replaced-${stamp}`));
  }

  const serverId = randomUUID();
  const name = serverName(serverId);
  const notAfter = new Date(now);
  notAfter.setUTCFullYear(notAfter.getUTCFullYear() + VALID_YEARS);
  const keyUsage = x509.KeyUsageFlags;

  const caKeys = (await webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify'])) as CryptoKeyPair;
  const ca = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: serial(),
    name: `CN=${name} CA, O=IMPOCARIBE`,
    notBefore: now,
    notAfter,
    signingAlgorithm: ALG,
    keys: caKeys,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(keyUsage.keyCertSign | keyUsage.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(caKeys.publicKey),
    ],
  });

  const keys = (await webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify'])) as CryptoKeyPair;
  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: serial(),
    subject: `CN=${serverId}.impocaribe, O=IMPOCARIBE`,
    issuer: ca.subject,
    notBefore: now,
    notAfter,
    signingAlgorithm: ALG,
    publicKey: keys.publicKey,
    signingKey: caKeys.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(keyUsage.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      // DT-18: el único nombre es la identidad. Ninguna IP: la dirección puede cambiar (Const. art. VIII.4).
      new x509.SubjectAlternativeNameExtension([{ type: 'dns', value: `${serverId}.impocaribe` }]),
      await x509.AuthorityKeyIdentifierExtension.create(caKeys.publicKey),
    ],
  });

  const identity: ServerIdentity = {
    serverId,
    name,
    caCertPem: ca.toString('pem') + '\n',
    certPem: leaf.toString('pem') + '\n',
    caFingerprint: '',
    keyPem: await pkcs8Pem(keys.privateKey),
  };
  identity.caFingerprint = new X509Certificate(identity.caCertPem).fingerprint256;

  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, FILES.meta),
    JSON.stringify({ serverId, name, caFingerprint: identity.caFingerprint, createdAt: now.toISOString() }, null, 2),
  );
  await writeFile(join(dir, FILES.ca), identity.caCertPem);
  await writeFile(join(dir, FILES.cert), identity.certPem);
  // La clave de la CA solo hace falta para volver a firmar (reparar o trasladar): se guarda, protegida, con el resto.
  await writeFile(
    join(dir, FILES.caKey),
    await options.protector.protect(Buffer.from(await pkcs8Pem(caKeys.privateKey))),
  );
  await writeFile(join(dir, FILES.key), await options.protector.protect(Buffer.from(identity.keyPem)));
  return identity;
}

export async function loadIdentity(dir: string, protector: SecretProtector): Promise<ServerIdentity> {
  const meta = JSON.parse(await readFile(join(dir, FILES.meta), 'utf8')) as {
    serverId: string;
    name: string;
    caFingerprint: string;
  };
  return {
    serverId: meta.serverId,
    name: meta.name,
    caFingerprint: meta.caFingerprint,
    caCertPem: await readFile(join(dir, FILES.ca), 'utf8'),
    certPem: await readFile(join(dir, FILES.cert), 'utf8'),
    keyPem: (await protector.unprotect(await readFile(join(dir, FILES.key)))).toString('utf8'),
  };
}

/** T130 · RF-INS-07: la identidad entera, con sus claves en claro, para el archivo de traslado (que va cifrado). */
export interface ExportedIdentity {
  meta: string;
  caCertPem: string;
  certPem: string;
  caKeyPem: string;
  keyPem: string;
}

export async function exportIdentity(dir: string, protector: SecretProtector): Promise<ExportedIdentity> {
  return {
    meta: await readFile(join(dir, FILES.meta), 'utf8'),
    caCertPem: await readFile(join(dir, FILES.ca), 'utf8'),
    certPem: await readFile(join(dir, FILES.cert), 'utf8'),
    caKeyPem: (await protector.unprotect(await readFile(join(dir, FILES.caKey)))).toString('utf8'),
    keyPem: (await protector.unprotect(await readFile(join(dir, FILES.key)))).toString('utf8'),
  };
}

/**
 * La identidad de un traslado en la PC nueva, con las claves protegidas por esta máquina (DPAPI no se puede abrir en
 * otra). Nunca sobre una identidad que ya existe: los dispositivos emparejados con ella quedarían huérfanos.
 */
export async function importIdentity(dir: string, e: ExportedIdentity, protector: SecretProtector): Promise<void> {
  if (await exists(join(dir, FILES.meta))) {
    const current = JSON.parse(await readFile(join(dir, FILES.meta), 'utf8')) as { name: string };
    throw new IdentityExistsError(`Esta PC ya tiene la identidad del servidor ${current.name}: no se reemplaza.`);
  }
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, FILES.meta), e.meta);
  await writeFile(join(dir, FILES.ca), e.caCertPem);
  await writeFile(join(dir, FILES.cert), e.certPem);
  await writeFile(join(dir, FILES.caKey), await protector.protect(Buffer.from(e.caKeyPem)));
  await writeFile(join(dir, FILES.key), await protector.protect(Buffer.from(e.keyPem)));
}
