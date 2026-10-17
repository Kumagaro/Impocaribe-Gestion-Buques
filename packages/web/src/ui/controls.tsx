// T023 · Controles base (plan §7.2): botones, campos y selección. Objetivos táctiles de 48 dp en teléfono y tablet
// (RNF-16) y escala al pulsar con su variante reducida (MOV-06, MOV-07).
import { Eye, EyeOff } from 'lucide-react';
import { m } from 'motion/react';
import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { press } from '../motion/presets';
import { useReducedMotionPreference } from '../motion/MotionProvider';
import { useTouch } from './device';
import { maskDigits, maskTons, maskUpper } from './masks';

// Motion redefine estos eventos y style con otra firma; los botones no los usan.
type NativeButton = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'style'
>;

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends NativeButton {
  variant?: ButtonVariant;
  /** MOV-07: acción en curso; el botón se desactiva y muestra `busyLabel`. */
  busy?: boolean;
  busyLabel?: string;
  /** EST-03: si la acción no está disponible, el motivo visible (p. ej. "Requiere conexión con el servidor"). */
  disabledReason?: string;
  icon?: ReactNode;
}

function usePress() {
  const reduced = useReducedMotionPreference();
  return { reduced, preset: press(reduced), touch: useTouch() };
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  busy = false,
  busyLabel,
  disabledReason,
  icon,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const { reduced, preset, touch } = usePress();
  const reasonId = useId();
  const button = (
    <m.button
      {...rest}
      type={type}
      className={cx('ui-button', `ui-button--${variant}`, className)}
      disabled={disabled || busy || disabledReason !== undefined}
      aria-busy={busy || undefined}
      title={disabledReason ?? rest.title}
      aria-describedby={disabledReason ? reasonId : rest['aria-describedby']}
      data-touch={touch || undefined}
      data-press={reduced ? 'color' : 'scale'}
      {...(busy ? {} : preset)}
    >
      {busy ? <span className="ui-spinner" aria-hidden="true" /> : icon}
      <span>{busy && busyLabel ? busyLabel : children}</span>
    </m.button>
  );
  if (!disabledReason) return button;
  return (
    <span className="ui-button-wrap">
      {button}
      <span id={reasonId} className="ui-button-reason">
        {disabledReason}
      </span>
    </span>
  );
}

export interface IconButtonProps extends NativeButton {
  label: string;
  icon: ReactNode;
}

export function IconButton({ label, icon, className, type = 'button', ...rest }: IconButtonProps) {
  const { reduced, preset, touch } = usePress();
  return (
    <m.button
      {...rest}
      type={type}
      className={cx('ui-icon-button', className)}
      aria-label={label}
      title={label}
      data-touch={touch || undefined}
      data-press={reduced ? 'color' : 'scale'}
      {...preset}
    >
      {icon}
    </m.button>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="ui-check" data-touch={useTouch() || undefined}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <span className="ui-switch" data-touch={useTouch() || undefined}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="ui-switch__track"
      >
        <span className="ui-switch__thumb" aria-hidden="true" />
      </button>
      <label htmlFor={id}>{label}</label>
    </span>
  );
}

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

export interface TextFieldProps extends NativeInput {
  value?: string;
  onValueChange?: (value: string) => void;
  invalid?: boolean;
  /** Chapas y códigos (RF-VAL-07). */
  uppercase?: boolean;
  /** Carné, licencia, DM y código de verificación. */
  digitsOnly?: boolean;
  /** Otra ayuda de escritura de ./masks, como el teléfono. */
  mask?: (raw: string) => string;
}

export function TextField({
  value,
  onValueChange,
  invalid,
  uppercase,
  digitsOnly,
  mask,
  className,
  ...rest
}: TextFieldProps) {
  return (
    <input
      type="text"
      inputMode={digitsOnly ? 'numeric' : undefined}
      {...rest}
      className={cx('ui-input', className)}
      data-touch={useTouch() || undefined}
      aria-invalid={invalid || undefined}
      value={value}
      onChange={(e) => {
        let next = e.target.value;
        if (uppercase) next = maskUpper(next);
        if (digitsOnly) next = maskDigits(next);
        if (mask) next = mask(next);
        onValueChange?.(next);
      }}
    />
  );
}

/** Contraseña con el botón de ojo dentro del campo, a la derecha, para verla u ocultarla. */
export function PasswordField({
  className,
  ...rest
}: Omit<TextFieldProps, 'type' | 'uppercase' | 'digitsOnly' | 'mask'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={cx('ui-password', className)}>
      <TextField {...rest} type={visible ? 'text' : 'password'} />
      <IconButton
        label={visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
        icon={visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        disabled={rest.disabled}
        onClick={() => setVisible((v) => !v)}
      />
    </div>
  );
}

export function TonsInput({
  value,
  onValueChange,
  invalid,
  className,
  ...rest
}: Omit<TextFieldProps, 'uppercase' | 'digitsOnly' | 'mask'>) {
  return (
    <span className={cx('ui-tons', className)}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        {...rest}
        className="ui-input ui-tons__input"
        data-touch={useTouch() || undefined}
        aria-invalid={invalid || undefined}
        value={value}
        onChange={(e) => onValueChange?.(maskTons(e.target.value))}
      />
      <span className="ui-tons__unit" aria-hidden="true">
        t
      </span>
    </span>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function Select({
  options,
  value,
  onValueChange,
  invalid,
  className,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  options: Option[];
  value: string;
  onValueChange: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <select
      {...rest}
      className={cx('ui-input', 'ui-select', className)}
      data-touch={useTouch() || undefined}
      aria-invalid={invalid || undefined}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lista con búsqueda (patrón combobox de ARIA): filtra sin distinguir mayúsculas ni tildes. */
export function Combobox({
  label,
  options,
  value,
  onChange,
  invalid,
  placeholder,
}: {
  label: string;
  options: Option[];
  value: string | null;
  onChange: (value: string | null) => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const open = query !== null;
  const matches = open ? options.filter((o) => fold(o.label).includes(fold(query))) : [];

  const close = () => {
    setQuery(null);
    setActive(-1);
  };
  const choose = (o: Option) => {
    onChange(o.value);
    close();
  };

  return (
    <div className="ui-combobox">
      <label htmlFor={`${id}-input`}>{label}</label>
      <input
        id={`${id}-input`}
        type="text"
        role="combobox"
        autoComplete="off"
        className="ui-input"
        data-touch={useTouch() || undefined}
        aria-invalid={invalid || undefined}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
        placeholder={placeholder}
        value={query ?? selectedLabel}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(-1);
        }}
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) setQuery('');
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && open && matches[active]) {
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            close();
          }
        }}
      />
      <ul id={`${id}-list`} role="listbox" className="ui-combobox__list" hidden={!open}>
        {matches.map((o, i) => (
          <li
            key={o.value}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === active}
            // mouseDown y no click: el clic llegaría después del blur, que ya cerró la lista.
            onMouseDown={(e) => {
              e.preventDefault();
              choose(o);
            }}
          >
            {o.label}
          </li>
        ))}
        {open && matches.length === 0 && query !== '' && (
          <li className="ui-combobox__empty" role="presentation">
            Sin resultados para «{query}»
          </li>
        )}
      </ul>
    </div>
  );
}

export function DateField({
  value,
  onValueChange,
  invalid,
  className,
  ...rest
}: Omit<NativeInput, 'type'> & { value: string; onValueChange: (value: string) => void; invalid?: boolean }) {
  return (
    <input
      {...rest}
      type="date"
      className={cx('ui-input', className)}
      data-touch={useTouch() || undefined}
      aria-invalid={invalid || undefined}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    />
  );
}
