// T024 · plan §7.7: react-hook-form con los esquemas compartidos (DT-25) y el momento de RF-VAL-02. Mientras se escribe
// por primera vez solo se ve la ayuda; al salir del campo aparece su error o advertencia; desde entonces se revalida al
// escribir. Al enviar: foco en el primer error y resumen. Los errores de campo del servidor vuelven a su campo (RF-VAL-04).
import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm, type DefaultValues, type FieldValues, type Path } from 'react-hook-form';
import type { z } from 'zod';
import { ApiError } from '../api/client';
import { useReducedMotionPreference } from '../motion/MotionProvider';
import type { FieldState, SummaryItem } from '../ui/form';

type Schema = z.ZodType<FieldValues, FieldValues>;

export interface ValidatedFormOptions<S extends Schema> {
  schema: S;
  defaultValues: DefaultValues<z.input<S>>;
  /** Etiqueta de cada campo, en el orden del formulario: la usan el resumen y el orden del foco. */
  labels: Record<keyof z.input<S> & string, string>;
  /** Advertencias que no bloquean (RF-VAL-08), calculadas con los valores actuales. */
  warnings?: (values: z.input<S>) => Partial<Record<keyof z.input<S> & string, string>>;
  onSubmit: (values: z.output<S>) => void | Promise<void>;
}

export interface FieldControl {
  id: string;
  name: string;
  value: string;
  invalid: boolean;
  'aria-describedby': string;
  ref: (el: HTMLInputElement | null) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onValueChange: (value: string) => void;
}

export function useValidatedForm<S extends Schema>({
  schema,
  defaultValues,
  labels,
  warnings,
  onSubmit,
}: ValidatedFormOptions<S>) {
  type In = z.input<S>;
  type Name = keyof In & string;
  const base = useId();
  const reduced = useReducedMotionPreference();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<In, unknown, z.output<S>>({
    resolver: zodResolver(schema as never),
    defaultValues,
    mode: 'onTouched',
    reValidateMode: 'onChange',
    shouldFocusError: false,
  });
  const { errors, isSubmitted, isDirty } = form.formState;
  const order = Object.keys(labels) as Name[];
  const idOf = (name: Name) => `${base}-${name}`;
  const messageOf = (name: Name) => errors[name]?.message as string | undefined;

  // MOV-13: la página se desplaza suavemente al primer error; con movimiento reducido, sin animar.
  const focusFirst = (names: Name[]) => {
    const first = order.find((n) => names.includes(n));
    const el = first && document.getElementById(idOf(first));
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  };

  const warningsNow: Partial<Record<Name, string>> = warnings ? warnings(form.watch() as In) : {};

  const field = (name: Name): { state: FieldState; control: FieldControl } => {
    const path = name as Path<In>;
    const { isTouched } = form.getFieldState(path, form.formState);
    const shown = isTouched || isSubmitted;
    const error = messageOf(name);
    const value = String(form.watch(path) ?? '');
    const reg = form.register(path);
    const id = idOf(name);
    return {
      state: { id, error, warning: shown ? warningsNow[name] : undefined, valid: shown && !error && value !== '' },
      control: {
        id,
        name,
        value,
        invalid: error !== undefined,
        'aria-describedby': `${id}-msg`,
        ref: reg.ref,
        onBlur: reg.onBlur,
        onValueChange: (v) => form.setValue(path, v as never, { shouldDirty: true, shouldValidate: shown }),
      },
    };
  };

  const submit = form.handleSubmit(
    async (values) => {
      setFormError(null);
      try {
        await onSubmit(values);
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        const fields = (e.details?.fields ?? {}) as Record<string, string>;
        const known = order.filter((n) => typeof fields[n] === 'string');
        for (const n of known) form.setError(n as Path<In>, { type: 'server', message: fields[n] as string });
        // Un error sin campo del formulario se muestra con su mensaje de negocio (RF-UI-07).
        if (known.length === 0) setFormError(e.message);
        else focusFirst(known);
      }
    },
    (invalid) => focusFirst(Object.keys(invalid) as Name[]),
  );

  const summary: SummaryItem[] = isSubmitted
    ? order.flatMap((n) => {
        const message = messageOf(n);
        return message ? [{ id: idOf(n), label: labels[n], message }] : [];
      })
    : [];

  return { field, submit, summary, formError, dirty: isDirty, form };
}
