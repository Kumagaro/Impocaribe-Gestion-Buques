import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { entriesOf, pack, unpack } from './pack.ts';

// T106 · plan §10.4: el paquete del respaldo (volcado de la base y carpeta de archivos).
const dir = () => mkdtempSync(join(tmpdir(), 'impocaribe-pack-'));

describe('paquete del respaldo', () => {
  it('ida y vuelta: el volcado y la carpeta de archivos, con subcarpetas y un archivo grande', async () => {
    const src = dir();
    const big = randomBytes(2.5 * 1024 * 1024);
    writeFileSync(join(src, 'db.dump'), big);
    mkdirSync(join(src, 'files', 'ab'), { recursive: true });
    mkdirSync(join(src, 'files', 'cd'), { recursive: true });
    writeFileSync(join(src, 'files', 'ab', 'abcdef'), 'firma');
    writeFileSync(join(src, 'files', 'cd', 'cdef01'), '');
    const entries = [
      { name: 'db.dump', path: join(src, 'db.dump') },
      ...(await entriesOf(join(src, 'files'), 'files')),
    ];
    expect(entries.map((e) => e.name)).toEqual(['db.dump', 'files/ab/abcdef', 'files/cd/cdef01']);
    const out = dir();
    await pack(entries, join(out, 'p.bin'));
    const dest = dir();
    expect(await unpack(join(out, 'p.bin'), dest)).toEqual(['db.dump', 'files/ab/abcdef', 'files/cd/cdef01']);
    expect(readFileSync(join(dest, 'db.dump')).equals(big)).toBe(true);
    expect(readFileSync(join(dest, 'files', 'ab', 'abcdef'), 'utf8')).toBe('firma');
    expect(readFileSync(join(dest, 'files', 'cd', 'cdef01')).length).toBe(0);
  });

  it('sin carpeta de archivos, solo el volcado', async () => {
    expect(await entriesOf(join(dir(), 'no-existe'), 'files')).toEqual([]);
  });

  it('rechaza nombres que salen de la carpeta y paquetes cortados', async () => {
    const src = dir();
    writeFileSync(join(src, 'x'), 'malo');
    for (const name of ['../fuera', 'files/../../fuera']) {
      await pack([{ name, path: join(src, 'x') }], join(src, 'evil.bin'));
      await expect(unpack(join(src, 'evil.bin'), dir())).rejects.toThrow(
        `El respaldo trae un nombre no válido: ${name}`,
      );
    }
    await pack([{ name: 'db.dump', path: join(src, 'x') }], join(src, 'ok.bin'));
    const cut = readFileSync(join(src, 'ok.bin')).subarray(0, 20);
    writeFileSync(join(src, 'cut.bin'), cut);
    await expect(unpack(join(src, 'cut.bin'), dir())).rejects.toThrow('El paquete del respaldo está incompleto.');
    writeFileSync(join(src, 'otro.bin'), 'no es un paquete');
    await expect(unpack(join(src, 'otro.bin'), dir())).rejects.toThrow('El contenido del respaldo no es válido.');
  });
});
