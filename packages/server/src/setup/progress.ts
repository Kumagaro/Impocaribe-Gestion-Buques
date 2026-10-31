// T126 · DT-17: la conversación entre la app (sin elevar) y el ayudante (elevado), por una tubería con nombre que crea la
// app con un nombre al azar y le pasa al lanzarlo. La app manda una línea JSON con lo que hay que hacer (el código de
// instalación va por aquí, no en la línea de comandos, que cualquier proceso puede leer); el ayudante contesta con su
// progreso, una línea JSON por evento, y la última es el resultado.
import { connect } from 'node:net';
import { lineReader, type SetupMessage } from '@impocaribe/shared';

export type ProgressMessage = SetupMessage;
/** El mismo lector de líneas que la app (shared/domain/setup.ts). */
export { lineReader };

export interface Progress {
  /** La primera línea de la app: qué hacer y con qué datos (sin validar: lo hace quien la usa). */
  request: Promise<unknown>;
  send(message: ProgressMessage): void;
  close(): Promise<void>;
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
  // Si la app se cierra a mitad, el ayudante sigue y termina: lo hecho queda en el diario, y al volver a crear sigue
  // desde ahí.
  socket.on('error', () => undefined);
  return {
    request: new Promise((resolve) => socket.on('data', lineReader<unknown>(resolve))),
    send: (m) => void socket.write(`${JSON.stringify(m)}\n`),
    // Con la tubería ya rota, «end» no avisaría nunca: se espera al cierre.
    close: () =>
      new Promise<void>((resolve) => {
        if (socket.destroyed) return resolve();
        socket.once('close', () => resolve());
        socket.end();
      }),
  };
}
