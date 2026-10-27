import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileJournal } from './journal.ts';
import { lineReader, progressTo, type ProgressMessage } from './progress.ts';

// T126 · DT-17: el progreso llega a la app por una tubería con nombre, en orden y completo; el diario sobrevive entero.
describe('progreso por tubería con nombre', () => {
  it('cada evento llega en orden, con el resultado al final', async () => {
    const name =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\impocaribe-prueba-${randomUUID()}`
        : join(tmpdir(), `${randomUUID()}.sock`);
    const received: ProgressMessage[] = [];
    const done = new Promise<void>((resolve) => {
      const server = createServer((socket) => {
        socket.on(
          'data',
          lineReader((m) => received.push(m)),
        );
        socket.on('end', () => {
          server.close();
          resolve();
        });
      });
      server.listen(name);
    });
    await new Promise((r) => setTimeout(r, 50));
    const progress = await progressTo(name);
    progress.send({ type: 'step', id: 'copiar', status: 'running' });
    progress.send({ type: 'log', id: 'copiar', line: 'copiando 1.204 archivos' });
    progress.send({ type: 'step', id: 'copiar', status: 'done' });
    progress.send({ type: 'outcome', outcome: { ok: true } });
    await progress.close();
    await done;
    expect(received).toEqual([
      { type: 'step', id: 'copiar', status: 'running' },
      { type: 'log', id: 'copiar', line: 'copiando 1.204 archivos' },
      { type: 'step', id: 'copiar', status: 'done' },
      { type: 'outcome', outcome: { ok: true } },
    ]);
  });

  it('las líneas partidas o juntas se separan bien', () => {
    const got: ProgressMessage[] = [];
    const read = lineReader((m) => got.push(m));
    read('{"type":"step","id":"a","sta');
    read('tus":"running"}\n{"type":"step","id":"a","status":"done"}\n');
    expect(got.map((m) => m.type === 'step' && m.status)).toEqual(['running', 'done']);
  });
});

describe('diario en disco', () => {
  it('guarda y vuelve a leer lo mismo; sin diario, null', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'impocaribe-diario-')), 'Impocaribe', 'setup-journal.json');
    const journal = fileJournal(path);
    expect(await journal.load()).toBeNull();
    const data = { operation: 'create', steps: [{ id: 'copiar', status: 'done' as const, info: { mine: true } }] };
    await journal.save(data);
    expect(await journal.load()).toEqual(data);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(data);
  });
});
