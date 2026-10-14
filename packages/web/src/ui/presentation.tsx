// T023 · Piezas de presentación (plan §7.2) y los estados obligatorios de ui-spec §2 (EST-01 a EST-06).
import { Inbox, TriangleAlert, X } from 'lucide-react';
import { m } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { AnimatedIcon } from '../motion/AnimatedIcon';
import { useReducedMotionPreference } from '../motion/MotionProvider';
import { listItem, progressSpring, skeletonShimmer } from '../motion/presets';
import { Button, IconButton } from './controls';
import { useTouch } from './device';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute';

export function Badge({ tone = 'mute', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="ui-badge" data-tone={tone}>
      {children}
    </span>
  );
}

export function Card({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="ui-card">
      {title && <h2 className="ui-card__title">{title}</h2>}
      {children}
    </section>
  );
}

export function StatCard({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="ui-stat">
      <div id={id} className="ui-stat__label">
        {label}
      </div>
      <div className="ui-stat__value">{value}</div>
      {note && <div className="ui-stat__note">{note}</div>}
    </div>
  );
}

export function ProgressBar({ label, value, tone = 'info' }: { label: string; value: number; tone?: Tone }) {
  const pct = Math.min(100, Math.max(0, value));
  const reduced = useReducedMotionPreference();
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="ui-progress"
    >
      <m.i
        className="ui-progress__fill"
        data-tone={tone}
        initial={false}
        animate={{ scaleX: pct / 100 }}
        transition={progressSpring(reduced)}
      />
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  const reduced = useReducedMotionPreference();
  const shimmer = skeletonShimmer(reduced);
  return (
    <div
      role="status"
      aria-label="Cargando…"
      aria-busy="true"
      className="ui-skeleton"
      data-motion={reduced ? 'static' : 'shimmer'}
    >
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="ui-skeleton__line">
          {!reduced && <m.span className="ui-skeleton__shine" {...shimmer} />}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon = <Inbox aria-hidden="true" />,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Solo si el rol permite la acción (EST-05). */
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="ui-empty">
      <span className="ui-empty__icon">{icon}</span>
      <p className="ui-empty__title">{title}</p>
      {description && <p className="ui-empty__text">{description}</p>}
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="ui-error">
      <TriangleAlert aria-hidden="true" className="ui-error__icon" />
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

/** ui-spec §1.2: banda siempre visible sin conexión; con conexión no ocupa espacio. */
export function OfflineBanner({
  online,
  asOf,
  pendingDrafts,
}: {
  online: boolean;
  asOf: string;
  pendingDrafts: number;
}) {
  if (online) return null;
  const drafts = pendingDrafts === 1 ? '1 borrador por subir' : `${pendingDrafts} borradores por subir`;
  return (
    <div role="status" className="ui-band" data-tone="mute">
      <AnimatedIcon name="offline" state="pulse" />
      <span>
        Sin conexión · datos al {asOf}
        {pendingDrafts > 0 && ` · ${drafts}`}
      </span>
    </div>
  );
}

/** EST-06: registro abierto por otro usuario. "Liberar" solo para quien puede (la Apoderada). */
export function LockedNotice({ by, since, onRelease }: { by: string; since: string; onRelease?: () => void }) {
  return (
    <div className="ui-locked">
      <AnimatedIcon name="lock" state="lock" />
      <span role="status">
        En edición por {by} desde {since}
      </span>
      {onRelease && (
        <Button variant="secondary" onClick={onRelease}>
          Liberar
        </Button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ui-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="ui-page-header__sub">{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
}

export function ListCard({
  title,
  aside,
  selected = false,
  onOpen,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  selected?: boolean;
  onOpen: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className="ui-list-card"
      data-touch={useTouch() || undefined}
      aria-current={selected || undefined}
      onClick={onOpen}
    >
      <span className="ui-list-card__head">
        <b>{title}</b>
        {aside}
      </span>
      {children && <span className="ui-list-card__body">{children}</span>}
    </button>
  );
}

// ---------- Toast (RF-UI-07): éxito que se va a los 4 s; un error se queda hasta cerrarlo ----------

export interface ToastInput {
  tone: 'success' | 'error' | 'info';
  text: string;
}
interface ToastItem extends ToastInput {
  id: number;
}

const SUCCESS_MS = 4000;
const ToastContext = createContext<{ show: (t: ToastInput) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fuera de ToastProvider');
  return ctx;
}

let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback((t: ToastInput) => setToasts((all) => [...all, { ...t, id: nextToastId++ }]), []);
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="ui-toasts">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const reduced = useReducedMotionPreference();
  const persistent = toast.tone === 'error';
  useEffect(() => {
    if (persistent) return;
    const timer = setTimeout(() => onDismiss(toast.id), SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [persistent, toast.id, onDismiss]);
  return (
    <m.div role={persistent ? 'alert' : 'status'} className="ui-toast" data-tone={toast.tone} {...listItem(reduced)}>
      {toast.tone === 'success' && <AnimatedIcon name="check" state="draw" />}
      <span>{toast.text}</span>
      {persistent && (
        <IconButton label="Cerrar aviso" icon={<X aria-hidden="true" />} onClick={() => onDismiss(toast.id)} />
      )}
    </m.div>
  );
}
