// T127 y T128 · el progreso del ayudante de instalación: la lista de pasos con su estado (MOV-07), su tiempo y el
// detalle técnico plegado. Lo usan P-28 (crear) y los asistentes de mantenimiento de P-29 (reparar, reiniciar).
import type { SetupProgress } from '@impocaribe/shared';

/** «4 min 12 s» o «0:41»: el total en palabras, cada paso como reloj. */
export const minutes = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};
export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function StepList({
  progress,
  now,
  label = 'Pasos de la creación',
}: {
  progress: SetupProgress;
  now: number;
  label?: string;
}) {
  return (
    <ul className="srv-checks" aria-label={label}>
      {progress.steps.map((s) => {
        const level =
          s.state === 'done' || s.state === 'undone'
            ? 'ok'
            : s.state === 'failed'
              ? 'bad'
              : s.state === 'running' || s.state === 'undoing'
                ? 'now'
                : 'next';
        const stateLabel = {
          pending: 'Pendiente',
          running: 'En curso',
          done: 'Hecho',
          failed: 'Fallido',
          undoing: 'Deshaciendo',
          undone: 'Deshecho',
        }[s.state];
        const ms = s.startedAt !== undefined ? (s.endedAt ?? now) - s.startedAt : null;
        return (
          <li key={s.id} data-state={s.state}>
            <span className="srv-mark" data-level={level} role="img" aria-label={stateLabel}>
              {level === 'ok' ? '✓' : level === 'bad' ? '✕' : ''}
            </span>
            <div>
              <b>{s.title}</b>
              {s.state === 'undone' && <span className="srv-detail">Deshecho.</span>}
            </div>
            <small>{ms !== null ? clock(ms) : ''}</small>
          </li>
        );
      })}
    </ul>
  );
}

export function TechnicalLog({ progress }: { progress: SetupProgress }) {
  if (progress.log.length === 0) return null;
  const time = (at: number) => new Date(at).toLocaleTimeString('es-CU', { hour12: false });
  return (
    <details className="srv-log">
      <summary>Detalle técnico</summary>
      <pre>
        {progress.log.map((l) => `${time(l.at)} ${l.id} · ${l.line}`).join('\n')}
        {progress.outcome && !progress.outcome.ok ? `\n${progress.outcome.step}: ${progress.outcome.error}` : ''}
      </pre>
    </details>
  );
}
