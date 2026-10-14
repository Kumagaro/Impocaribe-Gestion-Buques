// T023 · Superposiciones (plan §7.2, MOV-04): diálogo en tablet y escritorio, hoja inferior con arrastre en teléfono, y los
// diálogos estándar de ui-spec §1.3 con las reglas de F-15 compartidas con el servidor.
import { confirmWordSchema, REASON_MAX, reasonSchema } from '@impocaribe/shared/validation';
import { m } from 'motion/react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotionPreference } from '../motion/MotionProvider';
import { dialog as dialogPreset, sheet as sheetPreset } from '../motion/presets';
import { Button, TextField } from './controls';
import { useDeviceClass } from './device';

/** Distancia de arrastre hacia abajo a partir de la cual la hoja se cierra. */
export const SHEET_CLOSE_PX = 80;

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface OverlayProps {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children?: ReactNode;
}

/** Foco dentro al abrir, Tab y Mayús+Tab atrapados, Esc cierra y, al cerrar, el foco vuelve a quien lo abrió. */
function useFocusTrap(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    return () => opener?.focus();
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const [first, last] = [items[0], items[items.length - 1]];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  return { ref, onKeyDown };
}

function OverlayFrame({
  kind,
  title,
  description,
  onClose,
  footer,
  children,
  dragOffset,
  header,
}: OverlayProps & {
  kind: 'dialog' | 'sheet';
  dragOffset?: number;
  header?: (node: ReactNode) => ReactNode;
}) {
  const reduced = useReducedMotionPreference();
  const trap = useFocusTrap(onClose);
  const titleId = useId();
  const descId = useId();
  const preset = kind === 'sheet' ? sheetPreset(reduced) : dialogPreset(reduced);
  const motion = reduced ? 'fade' : kind === 'sheet' ? 'slide' : 'scale';
  const heading = (
    <h2 id={titleId} className="ui-overlay__title">
      {title}
    </h2>
  );
  return createPortal(
    <div className={`ui-overlay ui-overlay--${kind}`}>
      <div className="ui-overlay__veil" onMouseDown={onClose} />
      <m.div
        ref={trap.ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`ui-${kind}`}
        data-kind={kind}
        data-motion={motion}
        onKeyDown={trap.onKeyDown}
        {...preset}
      >
        <div
          data-testid={kind === 'sheet' ? 'sheet-drag' : undefined}
          className="ui-overlay__body"
          style={kind === 'sheet' ? { transform: `translateY(${dragOffset ?? 0}px)` } : undefined}
        >
          {header ? header(heading) : heading}
          {description && (
            <p id={descId} className="ui-overlay__desc">
              {description}
            </p>
          )}
          {children}
          {footer && <div className="ui-overlay__footer">{footer}</div>}
        </div>
      </m.div>
    </div>,
    document.body,
  );
}

export function Dialog(props: OverlayProps) {
  return <OverlayFrame kind="dialog" {...props} />;
}

/** Hoja inferior de teléfono: se cierra al arrastrarla hacia abajo más de {@link SHEET_CLOSE_PX}; si no, vuelve. */
export function Sheet(props: OverlayProps) {
  const [offset, setOffset] = useState(0);
  const start = useRef<number | null>(null);
  const distance = (e: PointerEvent) => Math.max(0, e.clientY - (start.current ?? e.clientY));
  return (
    <OverlayFrame
      kind="sheet"
      {...props}
      dragOffset={offset}
      header={(heading) => (
        <div
          className="ui-sheet__handle"
          onPointerDown={(e) => {
            start.current = e.clientY;
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (start.current !== null) setOffset(distance(e));
          }}
          onPointerUp={(e) => {
            const d = distance(e);
            start.current = null;
            setOffset(0);
            if (d > SHEET_CLOSE_PX) props.onClose();
          }}
          onPointerCancel={() => {
            start.current = null;
            setOffset(0);
          }}
        >
          <span className="ui-sheet__grabber" aria-hidden="true" />
          {heading}
        </div>
      )}
    />
  );
}

/** Hoja en teléfono y diálogo en tablet y escritorio (MOV-04). */
export function Modal(props: OverlayProps) {
  return useDeviceClass() === 'phone' ? <Sheet {...props} /> : <Dialog {...props} />;
}

function ReasonForm({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  danger,
}: {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  danger?: boolean;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const submit = () => {
    const parsed = reasonSchema.safeParse(value);
    if (parsed.success) onConfirm(parsed.data);
    else setError(parsed.error.issues[0]?.message ?? null);
  };
  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="ui-reason">
        <label htmlFor={`${id}-reason`}>Motivo</label>
        <textarea
          id={`${id}-reason`}
          className="ui-input ui-textarea"
          rows={4}
          maxLength={REASON_MAX}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-msg`}
          onChange={(e) => {
            setValue(e.target.value);
            // Tras marcarse, el error se va en cuanto el motivo es válido (RF-VAL-02).
            if (error && reasonSchema.safeParse(e.target.value).success) setError(null);
          }}
        />
        <div className="ui-reason__foot">
          <span id={`${id}-msg`} className="ui-msgline" data-tone={error ? 'bad' : undefined}>
            {error ?? 'Queda registrado en la bitácora.'}
          </span>
          <span className="ui-reason__count">
            {value.length}/{REASON_MAX}
          </span>
        </div>
      </div>
    </Modal>
  );
}

export function ReasonDialog(props: {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  return <ReasonForm {...props} danger />;
}

/** Excepción: explica la regla que se salta, con sus números concretos, y exige el motivo. */
export function OverrideDialog({
  rule,
  ...props
}: {
  title: string;
  rule: ReactNode;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  return <ReasonForm {...props} description={rule} />;
}

/** Confirmación destructiva: hay que escribir la palabra exacta (por ejemplo, "RESTAURAR"). */
export function ConfirmDialog({
  title,
  description,
  word,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: ReactNode;
  word: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const schema = confirmWordSchema(word);
  const id = useId();
  const submit = () => {
    const parsed = schema.safeParse(value);
    if (parsed.success) onConfirm();
    else setError(parsed.error.issues[0]?.message ?? null);
  };
  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="ui-reason">
        <label htmlFor={`${id}-word`}>Escriba {word} para confirmar</label>
        <TextField
          id={`${id}-word`}
          autoComplete="off"
          spellCheck={false}
          value={value}
          invalid={error !== null}
          aria-describedby={`${id}-msg`}
          onValueChange={(v) => {
            setValue(v);
            if (error && schema.safeParse(v).success) setError(null);
          }}
        />
        <span id={`${id}-msg`} className="ui-msgline" data-tone={error ? 'bad' : undefined}>
          {error ?? ''}
        </span>
      </div>
    </Modal>
  );
}
