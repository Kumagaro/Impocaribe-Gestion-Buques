import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { z } from 'zod';
import { useValidatedForm } from '../validation/useValidatedForm';
import { Button, TextField, TonsInput } from './controls';
import { ErrorSummary, Field, LegalNotice } from './form';
import { maskPhone } from './masks';

// T024: los niveles de mensaje (ui-spec §2.1) y un formulario completo con el momento de RF-VAL-02. El esquema es de
// muestra; los de verdad están en shared/validation/forms.
const meta: Meta = { title: 'Componentes/Formularios' };
export default meta;

export const Niveles: StoryObj = {
  name: 'Niveles de mensaje',
  render: () => (
    <div style={{ display: 'grid', gap: 18, maxWidth: 420 }}>
      <Field id="s-help" label="Carné" help="11 dígitos, como en el carné de identidad.">
        <TextField id="s-help" aria-describedby="s-help-msg" value="" onValueChange={() => undefined} />
      </Field>
      <Field id="s-err" label="Carné" error="El carné debe tener 11 dígitos (tiene 10).">
        <TextField id="s-err" aria-describedby="s-err-msg" invalid value="8401191234" onValueChange={() => undefined} />
      </Field>
      <Field id="s-warn" label="Nombre" warning="Hay un chofer parecido: Juan Carlos Miranda González">
        <TextField
          id="s-warn"
          aria-describedby="s-warn-msg"
          value="Juan Carlos Miranda"
          onValueChange={() => undefined}
        />
      </Field>
      <Field id="s-ok" label="Chapa" exacting valid help="Como W011612.">
        <TextField id="s-ok" aria-describedby="s-ok-msg" value="W011612" onValueChange={() => undefined} />
      </Field>
      <Field id="s-date" label="Fecha de la DM" warning="La fecha de la DM es la de hoy.">
        <TextField
          id="s-date"
          aria-describedby="s-date-msg"
          disabled
          value="14/10/2026"
          onValueChange={() => undefined}
        />
      </Field>
      <LegalNotice
        summary="La fecha de la DM es la de hoy y no se puede cambiar."
        details="La DM se fecha el día de su registro en el sistema; si la mercancía se declaró otro día, anótelo en las observaciones."
      />
      <ErrorSummary
        errors={[
          { id: 's-err', label: 'Carné', message: 'El carné debe tener 11 dígitos (tiene 10).' },
          { id: 's-ok', label: 'Chapa', message: 'La chapa es una letra y 6 dígitos, como W011612.' },
        ]}
      />
    </div>
  ),
};

const schema = z.object({
  carne: z.string().superRefine((v, ctx) => {
    if (!/^\d{11}$/.test(v))
      ctx.addIssue({ code: 'custom', message: `El carné debe tener 11 dígitos (tiene ${v.length}).` });
  }),
  telefono: z.string().regex(/^(\+53 )?\d{8}$/, 'El teléfono tiene 8 dígitos, como 52345678.'),
  chapa: z.string().regex(/^[A-Z]\d{6}$/, 'La chapa es una letra y 6 dígitos, como W011612.'),
  toneladas: z.string().regex(/^\d+(,\d{1,3})?$/, 'Escriba las toneladas, como 17,280.'),
});

function DemoForm() {
  const [saved, setSaved] = useState<string | null>(null);
  const form = useValidatedForm({
    schema,
    defaultValues: { carne: '', telefono: '', chapa: '', toneladas: '' },
    labels: { carne: 'Carné', telefono: 'Teléfono', chapa: 'Chapa', toneladas: 'Toneladas' },
    warnings: (v) =>
      v.toneladas.startsWith('3') ? { toneladas: 'Tras la orden quedarían menos de 1,000 t en la DM.' } : {},
    onSubmit: (v) => setSaved(JSON.stringify(v)),
  });
  const f = (n: 'carne' | 'telefono' | 'chapa' | 'toneladas') => form.field(n);
  return (
    <form onSubmit={form.submit} noValidate style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
      <ErrorSummary errors={form.summary} />
      <Field label="Carné" help="11 dígitos." exacting {...f('carne').state}>
        <TextField digitsOnly {...f('carne').control} />
      </Field>
      <Field label="Teléfono" help="8 dígitos; puede empezar por +53." {...f('telefono').state}>
        <TextField mask={maskPhone} inputMode="tel" {...f('telefono').control} />
      </Field>
      <Field label="Chapa" help="Como W011612." exacting {...f('chapa').state}>
        <TextField uppercase {...f('chapa').control} />
      </Field>
      <Field label="Toneladas" help="Coma o punto, hasta 3 decimales." {...f('toneladas').state}>
        <TonsInput {...f('toneladas').control} />
      </Field>
      <Button type="submit">Guardar</Button>
      {saved && <code>{saved}</code>}
    </form>
  );
}

export const Formulario: StoryObj = { render: () => <DemoForm /> };
