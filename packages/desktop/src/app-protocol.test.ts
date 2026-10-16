import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppFile } from './app-protocol.ts';

// T003 / DT-02: app://impocaribe/… sirve el build de web y nunca un archivo fuera de él.
const root = join('C:', 'app', 'web');

describe('resolveAppFile', () => {
  it('traduce la raíz a index.html', () => {
    expect(resolveAppFile('app://impocaribe/', root)).toBe(join(root, 'index.html'));
  });

  it('traduce un recurso a su archivo dentro del build', () => {
    expect(resolveAppFile('app://impocaribe/assets/index-abc.js', root)).toBe(join(root, 'assets', 'index-abc.js'));
  });

  it('rechaza salir de la carpeta del build', () => {
    expect(resolveAppFile('app://impocaribe/..%2F..%2Fsecreto.txt', root)).toBeNull();
  });

  it('rechaza otro host', () => {
    expect(resolveAppFile('app://otro/index.html', root)).toBeNull();
  });
});
