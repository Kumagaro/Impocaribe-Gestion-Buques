import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderUi } from '../../test/render';
import { Button, Checkbox, Combobox, DateField, IconButton, Select, Switch, TextField, TonsInput } from './controls';

// T023 · plan §7.2, RF-UI-03 a 08 y RNF-16: estados, teclado y foco, objetivos táctiles de 48 dp y movimiento.

describe('Button', () => {
  it('ejecuta su acción al pulsarlo', async () => {
    const onClick = vi.fn();
    renderUi(<Button onClick={onClick}>Emitir orden</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Emitir orden' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('se activa con Enter y con Espacio desde el teclado', async () => {
    const onClick = vi.fn();
    renderUi(<Button onClick={onClick}>Guardar borrador</Button>);
    screen.getByRole('button').focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('MOV-07: en curso queda desactivado, anuncia que trabaja y muestra el texto de progreso', async () => {
    const onClick = vi.fn();
    renderUi(
      <Button busy busyLabel="Emitiendo…" onClick={onClick}>
        Emitir orden
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Emitiendo…' });
    expect([button.hasAttribute('disabled'), button.getAttribute('aria-busy')]).toEqual([true, 'true']);
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('EST-03: desactivado, explica por qué', () => {
    renderUi(<Button disabledReason="Requiere conexión con el servidor">Emitir orden</Button>);
    const button = screen.getByRole('button', { name: 'Emitir orden' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('title')).toBe('Requiere conexión con el servidor');
    expect(screen.getByText('Requiere conexión con el servidor').id).toBe(button.getAttribute('aria-describedby'));
  });

  it.each([
    ['phone', 'true'],
    ['tablet', 'true'],
    ['desktop', null],
  ] as const)('RNF-16: en %s el objetivo táctil de 48 dp está activo → %s', (device, touch) => {
    renderUi(<Button>Emitir</Button>, { device });
    expect(screen.getByRole('button').getAttribute('data-touch')).toBe(touch);
  });

  it('MOV-06: se reduce al pulsar; con movimiento reducido, no', () => {
    const { unmount } = renderUi(<Button>Emitir</Button>);
    expect(screen.getByRole('button').getAttribute('data-press')).toBe('scale');
    unmount();
    renderUi(<Button>Emitir</Button>, { reduceMotion: true });
    expect(screen.getByRole('button').getAttribute('data-press')).toBe('color');
  });
});

describe('IconButton', () => {
  it('tiene nombre accesible aunque solo muestre un icono', () => {
    renderUi(<IconButton label="Buscar" icon={<svg />} onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Buscar' }).getAttribute('title')).toBe('Buscar');
  });
});

describe('Checkbox y Switch', () => {
  it('la casilla cambia con un clic en su etiqueta y con Espacio', async () => {
    function Probe() {
      const [checked, setChecked] = useState(false);
      return <Checkbox label="Mantener sesión (30 días)" checked={checked} onChange={setChecked} />;
    }
    renderUi(<Probe />);
    const box = screen.getByRole('checkbox', { name: 'Mantener sesión (30 días)' });
    await userEvent.click(screen.getByText('Mantener sesión (30 días)'));
    expect((box as HTMLInputElement).checked).toBe(true);
    box.focus();
    await userEvent.keyboard(' ');
    expect((box as HTMLInputElement).checked).toBe(false);
  });

  it('el interruptor expone su estado y cambia con Espacio', async () => {
    function Probe() {
      const [on, setOn] = useState(false);
      return <Switch label="Reducir animaciones" checked={on} onChange={setOn} />;
    }
    renderUi(<Probe />);
    const sw = screen.getByRole('switch', { name: 'Reducir animaciones' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.focus();
    await userEvent.keyboard(' ');
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });
});

describe('TextField', () => {
  it('marca el campo inválido para el lector de pantalla', () => {
    renderUi(<TextField aria-label="Carné" invalid defaultValue="840119" />);
    expect(screen.getByRole('textbox', { name: 'Carné' }).getAttribute('aria-invalid')).toBe('true');
  });

  it('pasa a mayúsculas cuando se pide (chapas, RF-VAL-07)', async () => {
    function Probe() {
      const [v, setV] = useState('');
      return <TextField aria-label="Chapa" uppercase value={v} onValueChange={setV} />;
    }
    renderUi(<Probe />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Chapa' }), 'w011612');
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('W011612');
  });

  it('solo admite dígitos cuando se pide (carné, licencia, DM, código)', async () => {
    function Probe() {
      const [v, setV] = useState('');
      return <TextField aria-label="Carné" digitsOnly value={v} onValueChange={setV} />;
    }
    renderUi(<Probe />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Carné' }), '84a01-19b');
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('840119');
  });
});

describe('TonsInput (RF-VAL-07: coma o punto, como máximo 3 decimales)', () => {
  function Probe({ onValue }: { onValue?: (v: string) => void }) {
    const [v, setV] = useState('');
    return (
      <TonsInput
        aria-label="Toneladas"
        value={v}
        onValueChange={(x) => {
          setV(x);
          onValue?.(x);
        }}
      />
    );
  }

  it.each([
    ['17,280', '17,280'],
    ['17.28', '17,28'],
    ['17,2805', '17,280'],
    ['1a7,x2', '17,2'],
    ['17,,2', '17,2'],
  ])('al escribir %s queda %s', async (typed, shown) => {
    renderUi(<Probe />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Toneladas' }), typed);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(shown);
  });

  it('muestra la unidad y abre el teclado decimal', () => {
    renderUi(<Probe />);
    expect(screen.getByRole('textbox').getAttribute('inputmode')).toBe('decimal');
    expect(screen.getByText('t').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Select', () => {
  it('elige una opción', async () => {
    const onChange = vi.fn();
    renderUi(
      <Select
        aria-label="Montaje de red"
        value="router"
        onValueChange={onChange}
        options={[
          { value: 'router', label: 'Router wifi' },
          { value: 'hotspot', label: 'Hotspot de un celular' },
        ]}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Montaje de red' }), 'hotspot');
    expect(onChange).toHaveBeenCalledWith('hotspot');
  });
});

describe('Combobox (con búsqueda)', () => {
  const OPTIONS = [
    { value: 'c1', label: 'NUEVOS TIEMPOS S.R.L.' },
    { value: 'c2', label: 'FUSION S.R.L.' },
    { value: 'c3', label: 'PARTICULAR A' },
    { value: 'c4', label: 'Ilén Fernández' },
  ];

  function Probe({ onChange = () => undefined }: { onChange?: (v: string | null) => void }) {
    const [v, setV] = useState<string | null>(null);
    return (
      <Combobox
        label="Cliente"
        options={OPTIONS}
        value={v}
        onChange={(x) => {
          setV(x);
          onChange(x);
        }}
      />
    );
  }

  it('filtra al escribir, sin importar mayúsculas ni tildes', async () => {
    renderUi(<Probe />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Cliente' }), 'ilen');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Ilén Fernández']);
  });

  it('se elige con las flechas y Enter', async () => {
    const onChange = vi.fn();
    renderUi(<Probe onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Cliente' });
    await userEvent.type(input, 's.r.l');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('c2');
    expect((input as HTMLInputElement).value).toBe('FUSION S.R.L.');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('Escape cierra la lista sin elegir', async () => {
    const onChange = vi.fn();
    renderUi(<Probe onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Cliente' });
    await userEvent.type(input, 'f');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    await userEvent.keyboard('{Escape}');
    expect([input.getAttribute('aria-expanded'), onChange.mock.calls.length]).toEqual(['false', 0]);
  });

  it('sin coincidencias lo dice', async () => {
    renderUi(<Probe />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Cliente' }), 'zzz');
    expect(screen.getByText('Sin resultados para «zzz»')).not.toBeNull();
  });

  it('con un clic en una opción la elige', async () => {
    const onChange = vi.fn();
    renderUi(<Probe onChange={onChange} />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Cliente' }), 'part');
    fireEvent.mouseDown(screen.getByRole('option', { name: 'PARTICULAR A' }));
    expect(onChange).toHaveBeenCalledWith('c3');
  });
});

describe('DateField', () => {
  it('limita el rango de fechas admitidas', () => {
    renderUi(<DateField aria-label="Fecha de carga" value="2026-10-14" min="2026-10-14" max="2026-10-21" onValueChange={() => undefined} />);
    const input = screen.getByLabelText('Fecha de carga');
    expect([input.getAttribute('type'), input.getAttribute('min'), input.getAttribute('max')]).toEqual([
      'date',
      '2026-10-14',
      '2026-10-21',
    ]);
  });
});
