// T024 · Presentación de la validación (ui-spec §2.1, RF-VAL-01, 09 a 11): una sola línea de mensaje por campo con
// prioridad error → advertencia → ayuda, marca de correcto, resumen de errores y aviso de cambios sin guardar.
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { m } from 'motion/react';
import { useId, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router';
import { AnimatedIcon } from '../motion/AnimatedIcon';
import { useReducedMotionPreference } from '../motion/MotionProvider';
import { fieldShake, summaryDrop } from '../motion/presets';
import { Button } from './controls';
import { Dialog } from './overlays';

/** Lo que `useValidatedForm().field(nombre).state` da a cada campo. */
export interface FieldState {
  id: string;
  error?: string | undefined;
  warning?: string | undefined;
  valid?: boolean | undefined;
}

export function Field({
  label,
  help,
  exacting = false,
  id,
  error,
  warning,
  valid,
  children,
}: FieldState & {
  label: string;
  help?: string;
  /** Formato exigente (carné, licencia, chapa, DM, códigos): muestra la marca de correcto (RF-VAL-09). */
  exacting?: boolean;
  /** El control, con el `id` y `aria-describedby` que da el formulario. */
  children: ReactNode;
}) {
  const reduced = useReducedMotionPreference();
  const level = error ? 'error' : warning ? 'warning' : 'help';
  const message = error ?? warning ?? help ?? '';
  const shake = fieldShake(reduced);
  return (
    <div className="ui-field" data-level={level}>
      <label htmlFor={id}>{label}</label>
      <m.div
        className="ui-field__control"
        data-motion={error ? (reduced ? 'color' : 'shake') : undefined}
        animate={error && shake.animate ? shake.animate : { x: 0 }}
        transition={shake.transition ?? { duration: 0 }}
      >
        {children}
        {exacting && valid && !error && (
          <span className="ui-field__ok">
            <AnimatedIcon name="check" state="draw" label="Correcto" size={18} />
          </span>
        )}
      </m.div>
      <div id={`${id}-msg`} className="ui-field__msg" aria-live="polite">
        {level === 'error' && <CircleAlert aria-hidden="true" />}
        {level === 'warning' && <TriangleAlert aria-hidden="true" />}
        <span>{message}</span>
      </div>
    </div>
  );
}

export interface SummaryItem {
  id: string;
  label: string;
  message: string;
}

/** MOV-13: "Hay N campos por corregir", con un enlace a cada uno. */
export function ErrorSummary({ errors }: { errors: SummaryItem[] }) {
  const reduced = useReducedMotionPreference();
  const titleId = useId();
  if (errors.length === 0) return null;
  const n = errors.length;
  return (
    <m.div role="alert" aria-labelledby={titleId} className="ui-error-summary" {...summaryDrop(reduced)}>
      <b id={titleId}>{`Hay ${n} ${n === 1 ? 'campo' : 'campos'} por corregir`}</b>
      <ul>
        {errors.map((e) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              onClick={(ev) => {
                ev.preventDefault();
                document.getElementById(e.id)?.focus();
              }}
            >
              {`${e.label}: ${e.message}`}
            </a>
          </li>
        ))}
      </ul>
    </m.div>
  );
}

/** Advertencia larga (como el aviso legal de RF-DM-13): recuadro ámbar bajo el campo, con "Ver más". */
export function LegalNotice({ summary, details }: { summary: string; details?: string }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  return (
    <div className="ui-legal">
      <span>{summary}</span>
      {open && details && <span id={detailsId}>{details}</span>}
      {details && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  );
}

/** RF-VAL-10: con cambios sin guardar, salir de la pantalla pregunta antes. */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(when);
  if (blocker.state !== 'blocked') return null;
  return (
    <Dialog
      title="Tiene cambios sin guardar. ¿Salir de todos modos?"
      onClose={() => blocker.reset()}
      footer={
        <>
          <Button variant="ghost" onClick={() => blocker.reset()}>
            Seguir editando
          </Button>
          <Button variant="danger" onClick={() => blocker.proceed()}>
            Salir
          </Button>
        </>
      }
    />
  );
}
