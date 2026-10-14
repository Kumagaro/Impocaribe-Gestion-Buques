// Plan §9 y Const. art. X.1: contraseñas y códigos con argon2id (64 MB, 3 iteraciones), con el argon2 que trae Node,
// sin dependencias nuevas. Se guarda en el formato PHC habitual: $argon2id$v=19$m=…,t=…,p=…$sal$hash.
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const run = promisify(argon2);
const PARAMS = { memory: 65536, passes: 3, parallelism: 1, tagLength: 32 };
const PREFIX = `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$`;
const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '');

async function derive(secret: string, salt: Buffer): Promise<Buffer> {
  return run('argon2id', { ...PARAMS, message: secret, nonce: salt });
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  return `${PREFIX}${b64(salt)}$${b64(await derive(secret, salt))}`;
}

export async function verifySecret(hash: string, secret: string): Promise<boolean> {
  if (!hash.startsWith(PREFIX)) return false;
  const [salt, tag] = hash.slice(PREFIX.length).split('$');
  if (!salt || !tag) return false;
  const expected = Buffer.from(tag, 'base64');
  const actual = await derive(secret, Buffer.from(salt, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
