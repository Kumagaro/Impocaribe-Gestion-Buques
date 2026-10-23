// T105 · DT-07, RF-RES-04, plan §10.4: cifrado híbrido de los respaldos. El servidor guarda la clave pública X25519 y la
// privada sellada con la contraseña de respaldo (argon2id + AES-256-GCM): el respaldo automático cifra sin conocer la
// contraseña y restaurar la exige. Cambiar la contraseña vuelve a sellar la misma clave privada, así los respaldos
// anteriores se siguen restaurando (decisión del responsable, 2026-10-23).
//
// Archivo `.icbak`: «ICBAK1\n» · longitud de la cabecera (uint32 BE) · cabecera JSON · datos cifrados · etiqueta GCM (16).
// Cada archivo usa una clave efímera X25519; la clave AES sale de ECDH + HKDF y la cabecera va autenticada (AAD).
import { AppError } from '@impocaribe/shared';
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { derive } from '../auth/password.ts';

const MAGIC = Buffer.from('ICBAK1\n');
const TAG = 16;
const INFO = Buffer.from('impocaribe-backup-v1');

/** La clave privada sellada con la contraseña (se guarda en system_settings). */
export interface SealedKey {
  v: 1;
  salt: string;
  nonce: string;
  tag: string;
  data: string;
}

export function newKeyPair(): { publicKey: string; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  return { publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), privateKey };
}

export async function sealPrivateKey(privateKey: KeyObject, password: string): Promise<SealedKey> {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', await derive(password, salt), nonce);
  const der = privateKey.export({ type: 'pkcs8', format: 'der' });
  const data = Buffer.concat([cipher.update(der), cipher.final()]);
  return {
    v: 1,
    salt: salt.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

const wrongPassword = () =>
  new AppError('BACKUP_PASSWORD_INVALID', 'La contraseña de respaldo no es correcta.', {
    fields: { password: 'La contraseña de respaldo no es correcta.' },
  });

/** Abre la clave privada; con otra contraseña, BACKUP_PASSWORD_INVALID (la etiqueta GCM no coincide). */
export async function openPrivateKey(sealed: SealedKey, password: string): Promise<KeyObject> {
  const key = await derive(password, Buffer.from(sealed.salt, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.nonce, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  try {
    const der = Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]);
    return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  } catch {
    throw wrongPassword();
  }
}

interface Header<M> {
  v: 1;
  /** Clave pública efímera (spki, base64). */
  epk: string;
  nonce: string;
  meta: M;
}

const aesKey = (secret: Buffer, epk: Buffer) => Buffer.from(hkdfSync('sha256', secret, epk, INFO, 32));

/** Cifra `src` en `dest` para la clave pública del servidor; `meta` viaja en claro, pero autenticado. */
export async function encryptFile<M>(src: string, dest: string, publicKey: string, meta: M): Promise<void> {
  const recipient = createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
  const eph = generateKeyPairSync('x25519');
  const epk = eph.publicKey.export({ type: 'spki', format: 'der' });
  const nonce = randomBytes(12);
  const header: Header<M> = { v: 1, epk: epk.toString('base64'), nonce: nonce.toString('base64'), meta };
  const headerBytes = Buffer.from(JSON.stringify(header));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(headerBytes.length);
  const cipher = createCipheriv(
    'aes-256-gcm',
    aesKey(diffieHellman({ privateKey: eph.privateKey, publicKey: recipient }), epk),
    nonce,
  );
  cipher.setAAD(headerBytes);
  const out = createWriteStream(dest);
  out.write(Buffer.concat([MAGIC, length, headerBytes]));
  await pipeline(createReadStream(src), cipher, out, { end: false });
  await new Promise<void>((resolve, reject) =>
    out.end(cipher.getAuthTag(), (err?: Error | null) => (err ? reject(err) : resolve())),
  );
}

async function readHeaderAt(path: string): Promise<{ header: Header<unknown>; bytes: Buffer; dataStart: number }> {
  const file = await open(path, 'r');
  try {
    const start = Buffer.alloc(MAGIC.length + 4);
    await file.read(start, 0, start.length, 0);
    if (!start.subarray(0, MAGIC.length).equals(MAGIC))
      throw new AppError('VALIDATION_ERROR', 'El archivo no es un respaldo de Impocaribe.');
    const length = start.readUInt32BE(MAGIC.length);
    const bytes = Buffer.alloc(length);
    await file.read(bytes, 0, length, start.length);
    return { header: JSON.parse(bytes.toString()) as Header<unknown>, bytes, dataStart: start.length + length };
  } finally {
    await file.close();
  }
}

/** Lo que dice la cabecera de un respaldo (tipo, fecha…), sin descifrarlo. */
export async function readMeta<M>(path: string): Promise<M> {
  return (await readHeaderAt(path)).header.meta as M;
}

/** Descifra `src` en `dest`. Si el archivo se alteró o la clave no es la suya, falla sin dejar datos a medias. */
export async function decryptFile(src: string, dest: string, privateKey: KeyObject): Promise<void> {
  const { header, bytes, dataStart } = await readHeaderAt(src);
  const size = (await stat(src)).size;
  const tag = Buffer.alloc(TAG);
  const file = await open(src, 'r');
  try {
    await file.read(tag, 0, TAG, size - TAG);
  } finally {
    await file.close();
  }
  const epk = Buffer.from(header.epk, 'base64');
  const sender = createPublicKey({ key: epk, format: 'der', type: 'spki' });
  const decipher = createDecipheriv(
    'aes-256-gcm',
    aesKey(diffieHellman({ privateKey, publicKey: sender }), epk),
    Buffer.from(header.nonce, 'base64'),
  );
  decipher.setAAD(bytes);
  decipher.setAuthTag(tag);
  const data =
    size - TAG > dataStart ? createReadStream(src, { start: dataStart, end: size - TAG - 1 }) : Readable.from([]);
  try {
    await pipeline(data, decipher, createWriteStream(dest));
  } catch {
    await rm(dest, { force: true });
    throw new AppError('VALIDATION_ERROR', 'El respaldo está dañado o no corresponde a este servidor.');
  }
}
