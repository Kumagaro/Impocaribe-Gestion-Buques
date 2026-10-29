// T127 · DT-17 y P-28: el lado de la app del ayudante de instalación (impocaribe-setup.exe, T126), que va en el
// server-bundle del instalador completo. Sin elevar, comprueba la PC y el código (pasos 1 y 2). Para crear, reparar,
// deshacer o restablecer lo lanza con el permiso de administrador de Windows (su propio diálogo) y habla con él por una
// tubería con nombre al azar: le manda la petición (con el código, que no va en la línea de comandos) y recibe su
// progreso. La app guarda lo recibido: si la ventana se cierra o se recarga, P-28 sigue donde iba.
import { lineReader } from '@impocaribe/shared';
import type {
  MoveFileInfo,
  PcFacts,
  SetupMessage,
  SetupOperation,
  SetupOutcome,
  SetupRequest,
} from '@impocaribe/shared';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';

/** Lanza el ayudante elevado y espera a que termine; devuelve su código de salida. */
export type Launcher = (exe: string, args: string[]) => Promise<number>;

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

/**
 * Con el diálogo de permiso de Windows (UAC): Start-Process -Verb RunAs. Si el usuario lo rechaza, PowerShell falla
 * sin que el ayudante llegue a arrancar (eso lo nota quien lo llama: nadie se conecta a la tubería).
 */
export const elevated: Launcher = (exe, args) =>
  new Promise((resolve) => {
    const command =
      `$p = Start-Process -FilePath ${quote(exe)} -ArgumentList ${args.map(quote).join(',')} ` +
      '-Verb RunAs -WindowStyle Hidden -PassThru -Wait; exit $p.ExitCode';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true }, (err) =>
      resolve(err ? (typeof err.code === 'number' ? err.code : 1) : 0),
    );
  });

export const NO_PERMISSION = 'No se concedió el permiso de administrador de Windows.';

export interface SetupState {
  running: boolean;
  operation: SetupOperation | null;
  /** Lo recibido del ayudante en la operación en curso o la última. */
  messages: SetupMessage[];
}

export class SetupHelper {
  private state: SetupState = { running: false, operation: null, messages: [] };

  constructor(
    private readonly exe: string,
    private readonly onMessage: (m: SetupMessage) => void,
    private readonly launch: Launcher = elevated,
  ) {}

  /** Paso 1, sin elevar: los datos de esta PC (memoria, disco, red, puertos, batería y otro servidor en la red). */
  facts(): Promise<PcFacts> {
    return new Promise((resolve, reject) =>
      execFile(this.exe, ['comprobar'], { windowsHide: true, timeout: 60_000 }, (err, stdout) => {
        if (err) return reject(new Error(`No se pudo comprobar esta PC: ${err.message}`));
        resolve(JSON.parse(stdout) as PcFacts);
      }),
    );
  }

  /** Paso 2, sin elevar: si el código es el de esta empresa (la comprobación que trae el instalador completo). */
  checkCode(code: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.exe, ['codigo'], { windowsHide: true });
      let out = '';
      child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
      child.on('error', reject);
      child.on('close', () => resolve(out.trim() === 'ok'));
      child.stdin.end(code);
    });
  }

  /**
   * T130 · P-28: de qué servidor es un archivo de traslado y si la contraseña lo abre, sin elevar. Un error del
   * ayudante («CÓDIGO: mensaje») llega como el mensaje solo.
   */
  readMove(file: string, password: string): Promise<MoveFileInfo> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.exe, ['traslado'], { windowsHide: true });
      let out = '';
      child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) return resolve(JSON.parse(out) as MoveFileInfo);
        reject(new Error(out.trim().replace(/^[A-Z_]+: /, '') || 'No se pudo leer el archivo de traslado.'));
      });
      child.stdin.end(JSON.stringify({ file, password }));
    });
  }

  current(): SetupState {
    return { ...this.state, messages: [...this.state.messages] };
  }

  /** Lanza el ayudante elevado con la petición y devuelve su resultado; el progreso va a `onMessage`. */
  async run(operation: SetupOperation, request: SetupRequest): Promise<SetupOutcome> {
    if (this.state.running) throw new Error('El ayudante de instalación ya está trabajando.');
    this.state = { running: true, operation, messages: [] };
    try {
      return await this.converse(operation, request);
    } finally {
      this.state.running = false;
    }
  }

  private async converse(operation: SetupOperation, request: SetupRequest): Promise<SetupOutcome> {
    const pipe = `\\\\.\\pipe\\impocaribe-setup-${randomUUID()}`;
    // Lo cambian los eventos de la conexión (un objeto: TypeScript no sigue las asignaciones dentro de los callbacks).
    const conn: { closed: Promise<void> | null; outcome: SetupOutcome | null } = { closed: null, outcome: null };
    const server = createServer((socket) => {
      // Solo la primera conexión, la del ayudante; cualquier otra se corta. La tubería sigue escuchando hasta que el
      // ayudante termina: cerrarla antes deja en Windows una instancia que acepta a otro cliente sin atenderlo.
      if (conn.closed) return void socket.destroy();
      conn.closed = new Promise((resolve) => socket.on('close', () => resolve()));
      socket.on('error', () => undefined);
      socket.on(
        'data',
        lineReader<SetupMessage>((m) => {
          if (m.type === 'outcome') conn.outcome = m.outcome;
          this.state.messages.push(m);
          this.onMessage(m);
        }),
      );
      socket.write(`${JSON.stringify(request)}\n`);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(pipe, resolve);
    });
    let exit: number;
    try {
      exit = await this.launch(this.exe, [operation, '--tuberia', pipe]);
    } finally {
      server.close();
    }
    if (!conn.closed) throw new Error(NO_PERMISSION);
    // Lo último que mandó puede llegar después de que el proceso termine.
    await conn.closed;
    return conn.outcome ?? { ok: false, step: 'inicio', error: `El ayudante terminó sin resultado (código ${exit}).` };
  }
}
