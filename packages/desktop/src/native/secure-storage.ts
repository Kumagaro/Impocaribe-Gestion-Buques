// T115 · plan §9 y §10.1: el almacenamiento seguro de la app de escritorio. Cada valor (emparejamiento, sesión, clave de
// la copia local) se cifra con `safeStorage` de Electron (DPAPI en Windows, atado al usuario de la PC) y se guarda en un
// archivo de la carpeta de datos de la app. El archivo se reemplaza entero: nunca queda a medias.
import { existsSync, readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';

/** Lo que se usa de `safeStorage` (en las pruebas, un cifrado de mentira). */
export interface Cipher {
  encryptString(value: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export class SecureStore {
  private values: Record<string, string>;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly cipher: Cipher,
  ) {
    this.values = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>) : {};
  }

  get(key: string): string | null {
    const stored = this.values[key];
    return stored === undefined ? null : this.cipher.decryptString(Buffer.from(stored, 'base64'));
  }

  set(key: string, value: string): Promise<void> {
    this.values[key] = this.cipher.encryptString(value).toString('base64');
    return this.save();
  }

  remove(key: string): Promise<void> {
    delete this.values[key];
    return this.save();
  }

  /** Una escritura detrás de otra, por un temporal que se renombra. */
  private save(): Promise<void> {
    const snapshot = JSON.stringify(this.values);
    this.writing = this.writing.then(async () => {
      const temp = `${this.file}.tmp`;
      await writeFile(temp, snapshot);
      await rename(temp, this.file);
    });
    return this.writing;
  }
}
