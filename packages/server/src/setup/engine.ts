// T126 · DT-17 y plan §10.3: el motor del ayudante de instalación. Ejecuta pasos idempotentes y anota cada resultado en
// un diario en disco (C:\ProgramData\Impocaribe\setup-journal.json), así que se puede reintentar desde el que falló, o
// deshacer en orden inverso lo hecho en este proceso: la PC queda como estaba. Nunca deja un servidor a medias.

/** Lo que un paso necesita guardar para deshacerse (p. ej., si la carpeta la creó él o ya existía). */
export type UndoInfo = Record<string, unknown>;

export interface Step {
  id: string;
  /** Para la lista de P-28. */
  title: string;
  /**
   * Idempotente: si ya está hecho, no lo repite. Devuelve lo que necesita para deshacerse. Si falla, quita antes lo que
   * dejó a medias: un paso fallido no queda en el diario como hecho, así que Deshacer no lo toca.
   */
  run(log: (line: string) => void): Promise<UndoInfo | void>;
  /** Deshace solo lo que hizo `run` (con lo que devolvió); lo que ya existía se deja. */
  undo(info: UndoInfo, log: (line: string) => void): Promise<void>;
}

export type StepStatus = 'done' | 'failed';

export interface JournalData {
  operation: string;
  steps: { id: string; status: StepStatus; info: UndoInfo; error?: string }[];
}

export interface Journal {
  load(): Promise<JournalData | null>;
  save(data: JournalData): Promise<void>;
}

export type SetupEvent =
  | { type: 'step'; id: string; status: 'running' | 'done' | 'failed' | 'undoing' | 'undone'; error?: string }
  | { type: 'log'; id: string; line: string };

export type Outcome = { ok: true } | { ok: false; step: string; error: string };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Ejecuta los pasos en orden. Los que el diario da por hechos en esta misma operación se saltan (reintentar sigue desde
 * el que falló), salvo los de `again`, que Reparar rehace (son idempotentes). Se detiene en el primero que falla.
 */
export async function runSteps(
  operation: string,
  steps: Step[],
  journal: Journal,
  report: (e: SetupEvent) => void,
  again: readonly string[] = [],
): Promise<Outcome> {
  const saved = await journal.load();
  const data: JournalData = saved?.operation === operation ? saved : { operation, steps: [] };
  for (const step of steps) {
    const entry = data.steps.find((s) => s.id === step.id);
    if (entry?.status === 'done' && !again.includes(step.id)) {
      report({ type: 'step', id: step.id, status: 'done' });
      continue;
    }
    report({ type: 'step', id: step.id, status: 'running' });
    try {
      const info = (await step.run((line) => report({ type: 'log', id: step.id, line }))) ?? {};
      // Un paso rehecho conserva lo que necesitaba para deshacerse la primera vez.
      const next = { id: step.id, status: 'done' as const, info: entry?.status === 'done' ? entry.info : info };
      data.steps = [...data.steps.filter((s) => s.id !== step.id), next];
      await journal.save(data);
      report({ type: 'step', id: step.id, status: 'done' });
    } catch (err) {
      const error = message(err);
      data.steps = [...data.steps.filter((s) => s.id !== step.id), { id: step.id, status: 'failed', info: {}, error }];
      await journal.save(data);
      report({ type: 'step', id: step.id, status: 'failed', error });
      return { ok: false, step: step.id, error };
    }
  }
  return { ok: true };
}

/**
 * Deshace lo hecho, del último paso al primero, y lo quita del diario a medida que lo deshace: si un deshacer falla,
 * volver a intentarlo sigue desde ahí.
 */
export async function undoSteps(
  operation: string,
  steps: Step[],
  journal: Journal,
  report: (e: SetupEvent) => void,
): Promise<Outcome> {
  const data = await journal.load();
  if (!data || data.operation !== operation) return { ok: true };
  for (const step of [...steps].reverse()) {
    const entry = data.steps.find((s) => s.id === step.id);
    if (!entry) continue;
    if (entry.status === 'done') {
      report({ type: 'step', id: step.id, status: 'undoing' });
      try {
        await step.undo(entry.info, (line) => report({ type: 'log', id: step.id, line }));
      } catch (err) {
        const error = message(err);
        report({ type: 'step', id: step.id, status: 'failed', error });
        return { ok: false, step: step.id, error };
      }
    }
    data.steps = data.steps.filter((s) => s.id !== step.id);
    await journal.save(data);
    report({ type: 'step', id: step.id, status: 'undone' });
  }
  return { ok: true };
}
