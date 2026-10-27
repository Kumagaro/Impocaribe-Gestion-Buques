// T126 · DT-17: la conversación entre la app (sin elevar) y el ayudante (elevado), por una tubería con nombre que crea la
// app con un nombre al azar y le pasa al lanzarlo. La app manda una línea JSON con lo que hay que hacer (el código de
// instalación va por aquí, no en la línea de comandos, que cualquier proceso puede leer); el ayudante contesta con su
// progreso, una línea JSON por evento, y la última es el resultado.
import { connect } from 'node:net';
import type { ServerCheck } from '@impocaribe/shared';
import type { Outcome, SetupEvent } from './engine.ts';

export type ProgressMessage =
  SetupEvent | { type: 'checks'; checks: ServerCheck[] } | { type: 'outcome'; outcome: Outcome };

export interface Progress {
  /** La primera línea de la app: qué hacer y con qué datos (sin validar: lo hace quien la usa). */
  request: Promise<unknown>;
  send(message: ProgressMessage): void;
  close(): Promise<void>;
}

/** El lado de la app (y la petición del ayudante): separa las líneas que llegan, partidas o varias juntas. */
export function lineReader<T = ProgressMessage>(onMessage: (m: T) => void): (chunk: Buffer | string) => void {
  let pending = '';
  return (chunk) => {
    pending += chunk.toString();
    const lines = pending.split('\n');
    pending = lines.pop()!;
    for (const line of lines) if (line.trim()) onMessage(JSON.parse(line) as T);
  };
}

/** Sin tubería (ejecutado a mano para soporte), la petición llega por la entrada y el progreso sale por la consola. */
export async function progressTo(pipe: string | undefined): Promise<Progress> {
  if (!pipe)
    return {
      request: new Promise((resolve) => process.stdin.on('data', lineReader<unknown>(resolve))),
      send: (m) => process.stdout.write(`${JSON.stringify(m)}\n`),
      close: async () => undefined,
    };
  const socket = connect(pipe);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  return {
    request: new Promise((resolve) => socket.on('data', lineReader<unknown>(resolve))),
    send: (m) => void socket.write(`${JSON.stringify(m)}\n`),
    close: () => new Promise<void>((resolve) => socket.end(resolve)),
  };
}
