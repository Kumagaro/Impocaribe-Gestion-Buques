// T125 · RF-INS-02: el código de instalación de cada empresa. Se genera al preparar el paquete, se imprime aparte y
// nunca va dentro: el instalador completo solo lleva su comprobación (argon2id). Antes de entregar el paquete se
// comprueba que el código no aparece en ningún archivo.
import { randomInt } from 'node:crypto';
import { RECOVERY_CODE_ALPHABET } from '../../packages/shared/src/validation/forms/F04.ts';

/** XXXX-XXXX-XXXX con el alfabeto de los códigos de recuperación (sin 0, O, 1, I ni L), al azar criptográfico. */
export function newInstallationCode(pick: (n: number) => number = randomInt): string {
  const c = Array.from({ length: 12 }, () => RECOVERY_CODE_ALPHABET[pick(RECOVERY_CODE_ALPHABET.length)]).join('');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}

/** Cómo podría aparecer en un archivo: con y sin guiones, en mayúsculas o minúsculas, en UTF-8 y en UTF-16 (Windows). */
function forms(code: string): Buffer[] {
  const plain = code.replaceAll('-', '');
  return [code, plain, code.toLowerCase(), plain.toLowerCase()].flatMap((t) => [
    Buffer.from(t, 'utf8'),
    Buffer.from(t, 'utf16le'),
  ]);
}

/** Los archivos que contienen el código en alguna de sus formas (debe ser ninguno). */
export function leaks(files: Iterable<{ path: string; bytes: Buffer }>, code: string): string[] {
  const needles = forms(code);
  return [...files].filter((f) => needles.some((n) => f.bytes.includes(n))).map((f) => f.path);
}
