import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { renderUi } from '../../test/render';
import { ApiError } from '../api/client';
import { TextField } from '../ui/controls';
import { ErrorSummary, Field, LegalNotice, UnsavedChangesGuard } from '../ui/form';
import { useValidatedForm } from './useValidatedForm';

// T024 · RF-VAL-01 a 03, 09 a 11, plan §7.7 y ui-spec §2.1: momento de la validación, resumen, errores del servidor y
// cambios sin guardar. El esquema imita a los del catálogo (shared/validation/forms), con mensajes concretos.

const schema = z.object({
  carne: z.string().superRefine((v, ctx) => {
    if (!/^\d{11}$/.test(v))
      ctx.addIssue({ code: 'custom', message: `El carné debe tener 11 dígitos (tiene ${v.length}).` });
  }),
  nombre: z.string().trim().min(1, 'Escriba el nombre.'),
  chapa: z.string().regex(/^[A-Z]\d{6}$/, 'La chapa es una letra y 6 dígitos, como W011612.'),
});
type Values = z.infer<typeof schema>;

function DriverForm({
  onSubmit = () => undefined,
  warnings,
}: {
  onSubmit?: (v: Values) => void | Promise<void>;
  warnings?: (v: Values) => Partial<Record<keyof Values, string>>;
}) {
  const form = useValidatedForm({
    schema,
    defaultValues: { carne: '', nombre: '', chapa: '' },
    labels: { carne: 'Carné', nombre: 'Nombre', chapa: 'Chapa' },
    ...(warnings ? { warnings } : {}),
    onSubmit,
  });
  const carne = form.field('carne');
  const nombre = form.field('nombre');
  const chapa = form.field('chapa');
  return (
    <form onSubmit={form.submit} noValidate>
      {form.formError && <p role="alert">{form.formError}</p>}
      <ErrorSummary errors={form.summary} />
      <Field label="Carné" help="11 dígitos, como en el carné de identidad." exacting {...carne.state}>
        <TextField digitsOnly {...carne.control} />
      </Field>
      <Field label="Nombre" help="Nombre y apellidos." {...nombre.state}>
        <TextField {...nombre.control} />
      </Field>
      <Field label="Chapa" help="Como W011612." exacting {...chapa.state}>
        <TextField uppercase {...chapa.control} />
      </Field>
      <button type="submit">Guardar</button>
    </form>
  );
}

const msg = (label: string) => document.getElementById(`${screen.getByLabelText(label).id}-msg`)?.textContent;

describe('RF-VAL-02: momento de la validación', () => {
  it('mientras se escribe por primera vez solo se ve la ayuda; al salir, el error', async () => {
    renderUi(<DriverForm />);
    const carne = screen.getByLabelText('Carné');
    await userEvent.type(carne, '8401191234');
    expect([msg('Carné'), carne.getAttribute('aria-invalid')]).toEqual([
      '11 dígitos, como en el carné de identidad.',
      null,
    ]);
    await userEvent.tab();
    expect([msg('Carné'), carne.getAttribute('aria-invalid')]).toEqual([
      'El carné debe tener 11 dígitos (tiene 10).',
      'true',
    ]);
  });

  it('tras marcarse, el error desaparece al corregir sin salir del campo', async () => {
    renderUi(<DriverForm />);
    const carne = screen.getByLabelText('Carné');
    await userEvent.type(carne, '8401191234');
    await userEvent.tab();
    await userEvent.click(carne);
    await userEvent.type(carne, '5');
    expect([msg('Carné'), carne.getAttribute('aria-invalid'), document.activeElement]).toEqual([
      '11 dígitos, como en el carné de identidad.',
      null,
      carne,
    ]);
  });

  it('RF-VAL-09: los campos de formato exigente muestran la marca de correcto al ser válidos', async () => {
    renderUi(<DriverForm />);
    await userEvent.type(screen.getByLabelText('Carné'), '84011912345');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Juan');
    await userEvent.tab();
    expect(screen.getAllByRole('img', { name: 'Correcto' })).toHaveLength(1);
  });
});

describe('RF-VAL-02.4: al enviar', () => {
  it('no envía, lleva el foco al primer error y el resumen enlaza a cada campo', async () => {
    const onSubmit = vi.fn();
    renderUi(<DriverForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Nombre'), 'Juan');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText('Carné'));
    const summary = screen.getByRole('alert', { name: 'Hay 2 campos por corregir' });
    const links = [...summary.querySelectorAll('a')];
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Carné: El carné debe tener 11 dígitos (tiene 0).', `#${screen.getByLabelText('Carné').id}`],
      ['Chapa: La chapa es una letra y 6 dígitos, como W011612.', `#${screen.getByLabelText('Chapa').id}`],
    ]);
    await userEvent.click(links[1] as HTMLAnchorElement);
    expect(document.activeElement).toBe(screen.getByLabelText('Chapa'));
  });

  it('el resumen se actualiza al corregir y desaparece sin errores', async () => {
    renderUi(<DriverForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByRole('alert', { name: 'Hay 3 campos por corregir' })).not.toBeNull();
    await userEvent.type(screen.getByLabelText('Carné'), '84011912345');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Juan');
    expect(screen.getByRole('alert', { name: 'Hay 1 campo por corregir' })).not.toBeNull();
    await userEvent.type(screen.getByLabelText('Chapa'), 'w011612');
    expect(screen.queryByRole('alert', { name: /por corregir/ })).toBeNull();
  });

  it('con datos válidos envía los valores que dejó el esquema', async () => {
    const onSubmit = vi.fn();
    renderUi(<DriverForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Carné'), '84011912345');
    await userEvent.type(screen.getByLabelText('Nombre'), '  Juan  ');
    await userEvent.type(screen.getByLabelText('Chapa'), 'w011612');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledWith({ carne: '84011912345', nombre: 'Juan', chapa: 'W011612' });
  });
});

describe('RF-VAL-04: errores del servidor', () => {
  it('un error con details.fields aparece en su campo', async () => {
    const onSubmit = vi.fn(() => {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Hay 1 campo por corregir.', {
        fields: { chapa: 'Ya existe un vehículo con la chapa W011612.' },
      });
    });
    renderUi(<DriverForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Carné'), '84011912345');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Juan');
    await userEvent.type(screen.getByLabelText('Chapa'), 'W011612');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect([msg('Chapa'), screen.getByLabelText('Chapa').getAttribute('aria-invalid')]).toEqual([
      'Ya existe un vehículo con la chapa W011612.',
      'true',
    ]);
    expect(document.activeElement).toBe(screen.getByLabelText('Chapa'));
  });

  it('otro error de negocio del servidor se muestra arriba del formulario (RF-UI-07)', async () => {
    const onSubmit = vi.fn(() => Promise.reject(new ApiError(0, 'OFFLINE', 'Sin conexión con el servidor.')));
    renderUi(<DriverForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Carné'), '84011912345');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Juan');
    await userEvent.type(screen.getByLabelText('Chapa'), 'W011612');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByRole('alert').textContent).toBe('Sin conexión con el servidor.');
  });

  it('un fallo que no es de la API no se oculta', async () => {
    const bug = new TypeError('x is undefined');
    let submit: () => Promise<void> = () => Promise.resolve();
    function Probe() {
      const form = useValidatedForm({
        schema: z.object({}),
        defaultValues: {},
        labels: {},
        onSubmit: () => Promise.reject(bug),
      });
      submit = () => form.submit();
      return null;
    }
    renderUi(<Probe />);
    await expect(act(() => submit())).rejects.toBe(bug);
  });
});

describe('RF-VAL-01: advertencias', () => {
  it('la advertencia aparece al salir del campo, no bloquea y el error tiene prioridad', async () => {
    const onSubmit = vi.fn();
    renderUi(
      <DriverForm
        onSubmit={onSubmit}
        warnings={(v) =>
          v.nombre.startsWith('Juan C') ? { nombre: 'Hay un chofer parecido: Juan Carlos Miranda González' } : {}
        }
      />,
    );
    await userEvent.type(screen.getByLabelText('Nombre'), 'Juan C');
    expect(msg('Nombre')).toBe('Nombre y apellidos.');
    await userEvent.tab();
    expect(msg('Nombre')).toBe('Hay un chofer parecido: Juan Carlos Miranda González');
    expect(screen.getByLabelText('Nombre').closest('[data-level]')?.getAttribute('data-level')).toBe('warning');
    await userEvent.type(screen.getByLabelText('Carné'), '84011912345');
    await userEvent.type(screen.getByLabelText('Chapa'), 'W011612');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('MOV-11: temblor del campo con error', () => {
  it('con movimiento tiembla al aparecer el error; con movimiento reducido solo cambia el color', async () => {
    const { unmount } = renderUi(<DriverForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByLabelText('Carné').closest('[data-motion]')?.getAttribute('data-motion')).toBe('shake');
    unmount();
    renderUi(<DriverForm />, { reduceMotion: true });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByLabelText('Carné').closest('[data-motion]')?.getAttribute('data-motion')).toBe('color');
  });

  it('RF-VAL-11: el mensaje del campo se anuncia al lector de pantalla', () => {
    renderUi(<DriverForm />);
    const line = document.getElementById(`${screen.getByLabelText('Carné').id}-msg`);
    expect([line?.getAttribute('aria-live'), screen.getByLabelText('Carné').getAttribute('aria-describedby')]).toEqual([
      'polite',
      line?.id,
    ]);
  });
});

describe('LegalNotice', () => {
  it('muestra el resumen y, con "Ver más", el texto completo', async () => {
    renderUi(
      <LegalNotice
        summary="La fecha de la DM es la de hoy."
        details="Según el procedimiento vigente, la DM se fecha el día de su registro."
      />,
    );
    const more = screen.getByRole('button', { name: 'Ver más' });
    expect([more.getAttribute('aria-expanded'), screen.queryByText(/procedimiento vigente/)]).toEqual(['false', null]);
    await userEvent.click(more);
    expect([more.getAttribute('aria-expanded'), screen.getByText(/procedimiento vigente/).textContent]).toEqual([
      'true',
      'Según el procedimiento vigente, la DM se fecha el día de su registro.',
    ]);
  });
});

describe('RF-VAL-10: cambios sin guardar', () => {
  function renderGuarded(dirty: boolean) {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <>
              <UnsavedChangesGuard when={dirty} />
              <Link to="/otra">Ir a otra</Link>
            </>
          ),
        },
        { path: '/otra', element: <p>Otra pantalla</p> },
      ],
      { initialEntries: ['/'] },
    );
    renderUi(<RouterProvider router={router} />);
    return router;
  }

  it('con cambios pregunta antes de salir; "Seguir editando" se queda', async () => {
    const router = renderGuarded(true);
    await userEvent.click(screen.getByRole('link', { name: 'Ir a otra' }));
    expect(screen.getByRole('dialog', { name: 'Tiene cambios sin guardar. ¿Salir de todos modos?' })).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect([screen.queryByRole('dialog'), router.state.location.pathname]).toEqual([null, '/']);
  });

  it('con cambios, "Salir" continúa la navegación', async () => {
    const router = renderGuarded(true);
    await userEvent.click(screen.getByRole('link', { name: 'Ir a otra' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect([screen.getByText('Otra pantalla').textContent, router.state.location.pathname]).toEqual([
      'Otra pantalla',
      '/otra',
    ]);
  });

  it('sin cambios sale sin preguntar', async () => {
    const router = renderGuarded(false);
    await userEvent.click(screen.getByRole('link', { name: 'Ir a otra' }));
    expect([screen.queryByRole('dialog'), router.state.location.pathname]).toEqual([null, '/otra']);
  });
});
