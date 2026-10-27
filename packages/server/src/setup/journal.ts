// T126 · plan §10.3: el diario del ayudante en disco. Se escribe entero en un archivo aparte y se renombra: un corte de
// luz a mitad deja el diario anterior, nunca uno roto.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Journal, JournalData } from './engine.ts';

export const journalPath = (env: NodeJS.ProcessEnv = process.env) =>
  join(env.ProgramData ?? 'C:\\ProgramData', 'Impocaribe', 'setup-journal.json');

export function fileJournal(path: string): Journal {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, 'utf8')) as JournalData;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async save(data) {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.tmp`;
      await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
      await rename(tmp, path);
    },
  };
}
