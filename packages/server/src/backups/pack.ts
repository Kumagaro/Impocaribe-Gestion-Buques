// T106 · plan §10.4: el contenido de un respaldo (el volcado de la base y la carpeta de archivos) en un solo archivo,
// que luego se cifra. Formato propio y mínimo, sin depender del tar del sistema: «ICPACK1\n» y, por cada archivo, la
// longitud del nombre (uint16 BE), el nombre (UTF-8, con «/»), el tamaño (uint64 BE) y los bytes; un nombre vacío cierra.
// Se copia por bloques: nunca se carga un archivo entero en memoria.
import { open, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const MAGIC = Buffer.from('ICPACK1\n');
const CHUNK = 1 << 20;

export interface PackEntry {
  /** Nombre dentro del paquete, con «/» (db.dump, files/ab/abcdef…). */
  name: string;
  path: string;
}

/** Todos los archivos bajo `dir`, con su nombre relativo bajo `prefix`. */
export async function entriesOf(dir: string, prefix: string): Promise<PackEntry[]> {
  const out: PackEntry[] = [];
  const walk = async (d: string) => {
    let items;
    try {
      items = await readdir(d, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw e;
    }
    for (const it of items.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(d, it.name);
      if (it.isDirectory()) await walk(full);
      else if (it.isFile()) out.push({ name: `${prefix}/${relative(dir, full).split(sep).join('/')}`, path: full });
    }
  };
  await walk(dir);
  return out;
}

export async function pack(entries: PackEntry[], dest: string): Promise<void> {
  const out = await open(dest, 'w');
  try {
    let pos = 0;
    const write = async (b: Buffer) => {
      await out.write(b, 0, b.length, pos);
      pos += b.length;
    };
    await write(MAGIC);
    const buf = Buffer.alloc(CHUNK);
    for (const e of entries) {
      const name = Buffer.from(e.name);
      const size = (await stat(e.path)).size;
      const head = Buffer.alloc(2 + name.length + 8);
      head.writeUInt16BE(name.length, 0);
      name.copy(head, 2);
      head.writeBigUInt64BE(BigInt(size), 2 + name.length);
      await write(head);
      const src = await open(e.path, 'r');
      try {
        for (let done = 0; done < size;) {
          const { bytesRead } = await src.read(buf, 0, Math.min(CHUNK, size - done), done);
          if (bytesRead === 0) throw new Error(`El archivo ${e.name} cambió mientras se respaldaba.`);
          await write(buf.subarray(0, bytesRead));
          done += bytesRead;
        }
      } finally {
        await src.close();
      }
    }
    await write(Buffer.alloc(2));
  } finally {
    await out.close();
  }
}

/** Desempaqueta en `destDir`. Un nombre que salga de la carpeta (absoluto o con «..») se rechaza. Devuelve los nombres. */
export async function unpack(src: string, destDir: string): Promise<string[]> {
  const root = resolve(destDir);
  const file = await open(src, 'r');
  const names: string[] = [];
  try {
    let pos = 0;
    const read = async (n: number) => {
      const b = Buffer.alloc(n);
      const { bytesRead } = await file.read(b, 0, n, pos);
      if (bytesRead !== n) throw new Error('El paquete del respaldo está incompleto.');
      pos += n;
      return b;
    };
    if (!(await read(MAGIC.length)).equals(MAGIC)) throw new Error('El contenido del respaldo no es válido.');
    const buf = Buffer.alloc(CHUNK);
    for (;;) {
      const length = (await read(2)).readUInt16BE(0);
      if (length === 0) break;
      const name = (await read(length)).toString();
      const target = resolve(root, ...name.split('/'));
      if (name.startsWith('/') || name.split('/').includes('..') || !target.startsWith(root + sep))
        throw new Error(`El respaldo trae un nombre no válido: ${name}`);
      const size = Number((await read(8)).readBigUInt64BE(0));
      await mkdir(dirname(target), { recursive: true });
      const out = await open(target, 'w');
      try {
        for (let done = 0; done < size;) {
          const { bytesRead } = await file.read(buf, 0, Math.min(CHUNK, size - done), pos);
          if (bytesRead === 0) throw new Error('El paquete del respaldo está incompleto.');
          await out.write(buf, 0, bytesRead, done);
          pos += bytesRead;
          done += bytesRead;
        }
      } finally {
        await out.close();
      }
      names.push(name);
    }
  } finally {
    await file.close();
  }
  return names;
}
