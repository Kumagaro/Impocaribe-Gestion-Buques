// T126 y T127 · DT-17 y plan §10.3: lo que se dicen la app de escritorio y el ayudante de instalación
// (impocaribe-setup.exe) por la tubería con nombre, y el estado de la creación que muestra P-28.
import type { ServerCheck } from './serverChecks.ts';

/** Lo que hace el ayudante elevado (con el permiso de administrador de Windows). */
export type SetupOperation =
  'crear' | 'reparar' | 'reiniciar' | 'actualizar' | 'trasladar' | 'desinstalar' | 'deshacer' | 'restablecer';

/** La primera línea de la app: con qué datos (el código nunca va en la línea de comandos). */
export interface SetupRequest {
  network?: 'router' | 'hotspot';
  code?: string;
  username?: string;
  password?: string;
  /** T130: crear desde un respaldo de traslado. */
  move?: { file: string; password: string };
  /** T130: dónde guardar el archivo de traslado (preparar). */
  dest?: string;
  /** T131: la palabra DESINSTALAR, y si se borran también los datos. */
  confirm?: string;
  wipe?: boolean;
}

/** T130 · P-28: de qué servidor es un archivo de traslado (lo lee el ayudante sin elevar, con la contraseña). */
export interface MoveFileInfo {
  serverName: string;
  createdAt: string;
  devices: number;
}

export type SetupStepStatus = 'running' | 'done' | 'failed' | 'undoing' | 'undone';

export type SetupEvent =
  { type: 'step'; id: string; status: SetupStepStatus; error?: string } | { type: 'log'; id: string; line: string };

/** `rolledBack`: al actualizar, si la vuelta atrás automática dejó la versión anterior con sus datos (T129). */
export type SetupOutcome = { ok: true } | { ok: false; step: string; error: string; rolledBack?: boolean };

/** Lo que manda el ayudante, una línea JSON por mensaje; la última es el resultado. */
export type SetupMessage =
  | SetupEvent
  | { type: 'plan'; steps: { id: string; title: string }[] }
  | { type: 'checks'; checks: ServerCheck[] }
  | { type: 'outcome'; outcome: SetupOutcome };

/** Los dos lados de la tubería: separa las líneas JSON que llegan, partidas o varias juntas. */
export function lineReader<T = SetupMessage>(onMessage: (m: T) => void): (chunk: { toString(): string }) => void {
  let pending = '';
  return (chunk) => {
    pending += chunk.toString();
    const lines = pending.split('\n');
    pending = lines.pop()!;
    for (const line of lines) if (line.trim()) onMessage(JSON.parse(line) as T);
  };
}

export type SetupStepState = 'pending' | SetupStepStatus;

export interface SetupProgress {
  steps: { id: string; title: string; state: SetupStepState; error?: string; startedAt?: number; endedAt?: number }[];
  /** El detalle técnico (plegado en P-28), con la hora de cada línea. */
  log: { at: number; id: string; line: string }[];
  checks: ServerCheck[] | null;
  outcome: SetupOutcome | null;
}

export const emptySetupProgress = (): SetupProgress => ({ steps: [], log: [], checks: null, outcome: null });

/** Aplica un mensaje del ayudante al estado de P-28 (`at`: la hora en que llegó, en ms). */
export function applySetupMessage(p: SetupProgress, m: SetupMessage, at: number): SetupProgress {
  switch (m.type) {
    case 'plan':
      return { ...p, steps: m.steps.map((s) => ({ ...s, state: 'pending' as const })), outcome: null };
    case 'checks':
      return { ...p, checks: m.checks };
    case 'outcome':
      return { ...p, outcome: m.outcome };
    case 'log':
      return { ...p, log: [...p.log, { at, id: m.id, line: m.line }] };
    case 'step':
      return {
        ...p,
        steps: p.steps.map((s) => {
          if (s.id !== m.id) return s;
          const start = m.status === 'running' || m.status === 'undoing';
          return {
            id: s.id,
            title: s.title,
            state: m.status,
            ...(m.error ? { error: m.error } : {}),
            ...(start
              ? { startedAt: at }
              : { ...(s.startedAt !== undefined ? { startedAt: s.startedAt } : {}), endedAt: at }),
          };
        }),
      };
  }
}

/** Para la barra general (MOV-03): los pasos hechos sobre el total, de 0 a 100. */
export function setupPercent(p: SetupProgress): number {
  if (p.steps.length === 0) return 0;
  return Math.round((p.steps.filter((s) => s.state === 'done').length / p.steps.length) * 100);
}
