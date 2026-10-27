// T126 · DT-17: el ayudante (elevado) informa a la app (sin elevar) por una tubería con nombre que crea la app, con un
// nombre al azar que le pasa al lanzarlo. Cada evento es una línea JSON; la última es el resultado.
import { connect } from 'node:net';
import type { Outcome, SetupEvent } from './engine.ts';

export type ProgressMessage = SetupEvent | { type: 'outcome'; outcome: Outcome };

export interface Progress {
  send(message: ProgressMessage): void;
  close(): Promise<void>;
}

/** Sin tubería (por ejemplo, ejecutado a mano para soporte), el progreso sale por la consola. */
export async function progressTo(pipe: string | undefined): Promise<Progress> {
  if (!pipe)
    return {
      send: (m) => process.stdout.write(`${JSON.stringify(m)}\n`),
      close: async () => undefined,
    };
  const socket = connect(pipe);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  return {
    send: (m) => void socket.write(`${JSON.stringify(m)}\n`),
    close: () => new Promise<void>((resolve) => socket.end(resolve)),
  };
}

/** El lado de la app: separa las líneas que llegan (pueden venir partidas o varias juntas) y las entrega una a una. */
export function lineReader(onMessage: (m: ProgressMessage) => void): (chunk: Buffer | string) => void {
  let pending = '';
  return (chunk) => {
    pending += chunk.toString();
    const lines = pending.split('\n');
    pending = lines.pop()!;
    for (const line of lines) if (line.trim()) onMessage(JSON.parse(line) as ProgressMessage);
  };
}
