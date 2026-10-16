import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderUi } from '../../test/render';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  ListCard,
  LockedNotice,
  Notice,
  OfflineBanner,
  PageHeader,
  ProgressBar,
  Skeleton,
  StatCard,
  ToastProvider,
  useToast,
} from './presentation';

// T023 · plan §7.2 y ui-spec §1.2 y §2 (EST-01 a EST-06): piezas de presentación y sus estados.

describe('Badge', () => {
  it('lleva su tono para el color y el texto para leerlo', () => {
    renderUi(<Badge tone="bad">Rechazada</Badge>);
    expect(screen.getByText('Rechazada').getAttribute('data-tone')).toBe('bad');
  });
});

describe('ProgressBar (MOV-03)', () => {
  it('expone el avance y lo limita entre 0 y 100', () => {
    renderUi(
      <>
        <ProgressBar label="Avance del buque" value={41.9} />
        <ProgressBar label="Pasado" value={130} />
        <ProgressBar label="Negativo" value={-5} />
      </>,
    );
    const now = (name: string) => screen.getByRole('progressbar', { name }).getAttribute('aria-valuenow');
    expect([now('Avance del buque'), now('Pasado'), now('Negativo')]).toEqual(['41.9', '100', '0']);
  });
});

describe('StatCard', () => {
  it('muestra la cifra con su etiqueta y la nota', () => {
    renderUi(<StatCard label="Saldo del buque" value="2 000,040 t" note="de 2 700,500 t" />);
    const card = screen.getByRole('group', { name: 'Saldo del buque' });
    expect(card.textContent).toBe('Saldo del buque2 000,040 tde 2 700,500 t');
  });
});

describe('Skeleton (EST-01, MOV-09)', () => {
  it('anuncia que carga y tiene brillo; con movimiento reducido, sin brillo', () => {
    const { unmount } = renderUi(<Skeleton lines={3} />);
    const region = screen.getByRole('status', { name: 'Cargando…' });
    expect([region.getAttribute('aria-busy'), region.getAttribute('data-motion')]).toEqual(['true', 'shimmer']);
    unmount();
    renderUi(<Skeleton lines={3} />, { reduceMotion: true });
    expect(screen.getByRole('status').getAttribute('data-motion')).toBe('static');
  });
});

describe('EmptyState (EST-02)', () => {
  it('explica por qué está vacío y ofrece la acción para empezar', async () => {
    const onAction = vi.fn();
    renderUi(
      <EmptyState
        title="No hay órdenes todavía"
        description="Las órdenes emitidas de este buque aparecen aquí."
        actionLabel="Nueva orden"
        onAction={onAction}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Nueva orden' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('EST-05: sin acción, si el rol no la permite', () => {
    renderUi(<EmptyState title="No hay órdenes todavía" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ErrorState (EST-04)', () => {
  it('da el mensaje de negocio como alerta y permite reintentar', async () => {
    const onRetry = vi.fn();
    renderUi(<ErrorState message="No se pudo cargar el buque." onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar el buque.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('OfflineBanner (EST-03, ui-spec §1.2)', () => {
  it('sin conexión dice desde cuándo son los datos y si hay borradores por subir', () => {
    renderUi(<OfflineBanner online={false} asOf="14/10/2026 16:40" pendingDrafts={2} />);
    expect(screen.getByRole('status').textContent).toBe(
      'Sin conexión · datos al 14/10/2026 16:40 · 2 borradores por subir',
    );
  });

  it('con un solo borrador usa el singular', () => {
    renderUi(<OfflineBanner online={false} asOf="14/10/2026 16:40" pendingDrafts={1} />);
    expect(screen.getByRole('status').textContent).toBe(
      'Sin conexión · datos al 14/10/2026 16:40 · 1 borrador por subir',
    );
  });

  it('con conexión no ocupa espacio', () => {
    const { container } = renderUi(<OfflineBanner online asOf="14/10/2026 16:40" pendingDrafts={0} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('LockedNotice (EST-06)', () => {
  it('dice quién edita y desde cuándo; solo con permiso ofrece Liberar', async () => {
    const onRelease = vi.fn();
    const { unmount } = renderUi(<LockedNotice by="Ilén Fernández" since="16:40" />);
    expect(screen.getByRole('status').textContent).toBe('En edición por Ilén Fernández desde 16:40');
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    renderUi(<LockedNotice by="Ilén Fernández" since="16:40" onRelease={onRelease} />);
    await userEvent.click(screen.getByRole('button', { name: 'Liberar' }));
    expect(onRelease).toHaveBeenCalledTimes(1);
  });
});

describe('PageHeader', () => {
  it('el título es el encabezado principal de la pantalla', () => {
    renderUi(<PageHeader title="Buque EAGLE 1" subtitle="Viaje 1 · 2026" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Buque EAGLE 1' })).not.toBeNull();
  });
});

describe('ListCard', () => {
  it('se abre con un clic o con Enter, y en teléfono tiene objetivo táctil', async () => {
    const onOpen = vi.fn();
    renderUi(
      <ListCard title="DM 00431" onOpen={onOpen}>
        NUEVOS TIEMPOS S.R.L.
      </ListCard>,
      { device: 'phone' },
    );
    const card = screen.getByRole('button', { name: /DM 00431/ });
    expect(card.getAttribute('data-touch')).toBe('true');
    await userEvent.click(card);
    card.focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('marca la seleccionada en la vista dividida', () => {
    renderUi(
      <ListCard title="DM 00431" selected onOpen={() => undefined}>
        x
      </ListCard>,
    );
    expect(screen.getByRole('button').getAttribute('aria-current')).toBe('true');
  });
});

describe('Toast (RF-UI-07)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function Trigger({ tone, text }: { tone: 'success' | 'error'; text: string }) {
    const toast = useToast();
    return <button onClick={() => toast.show({ tone, text })}>mostrar</button>;
  }

  it('el éxito se anuncia y se va solo a los 4 s', () => {
    vi.useFakeTimers();
    renderUi(
      <ToastProvider>
        <Trigger tone="success" text="Orden EAGLE1-2026-V1-0042 emitida" />
      </ToastProvider>,
      { reduceMotion: true },
    );
    act(() => screen.getByRole('button', { name: 'mostrar' }).click());
    expect(screen.getByRole('status').textContent).toContain('Orden EAGLE1-2026-V1-0042 emitida');
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.queryByText('Orden EAGLE1-2026-V1-0042 emitida')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Orden EAGLE1-2026-V1-0042 emitida')).toBeNull();
  });

  it('el error se queda hasta que se cierra', async () => {
    renderUi(
      <ToastProvider>
        <Trigger tone="error" text="Las toneladas superan el saldo de la DM" />
      </ToastProvider>,
      { reduceMotion: true },
    );
    await userEvent.click(screen.getByRole('button', { name: 'mostrar' }));
    expect(screen.getByRole('alert').textContent).toContain('Las toneladas superan el saldo de la DM');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Card', () => {
  it('es una sección con su título como encabezado', () => {
    renderUi(<Card title="Resumen del buque">Contenido</Card>);
    const heading = screen.getByRole('heading', { level: 2, name: 'Resumen del buque' });
    expect(heading.closest('section')?.textContent).toBe('Resumen del buqueContenido');
  });

  it('sin título no pinta encabezado', () => {
    renderUi(<Card>Solo contenido</Card>);
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

describe('RNF-16: objetivo táctil de 48 dp también en tablet', () => {
  it.each([
    ['tablet', 'true'],
    ['desktop', null],
  ] as const)('ListCard en %s → data-touch %s', (device, touch) => {
    renderUi(<ListCard title="DM 00431" onOpen={() => undefined} />, { device });
    expect(screen.getByRole('button').getAttribute('data-touch')).toBe(touch);
  });
});

describe('MOV-09 con la preferencia del sistema', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('con prefers-reduced-motion del sistema, un componente recibe la variante reducida', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    renderUi(<Skeleton lines={2} />);
    expect(screen.getByRole('status').getAttribute('data-motion')).toBe('static');
  });
});

describe('Notice (T037: avisos de las pantallas de acceso)', () => {
  it('un error se anuncia como alerta; una información, como estado', () => {
    renderUi(
      <>
        <Notice tone="bad">Usuario o contraseña incorrectos.</Notice>
        <Notice tone="info">El sistema aún no está configurado.</Notice>
      </>,
    );
    expect([screen.getByRole('alert').textContent, screen.getByRole('status').textContent]).toEqual([
      'Usuario o contraseña incorrectos.',
      'El sistema aún no está configurado.',
    ]);
  });

  it('lleva su tono para el color', () => {
    renderUi(<Notice tone="warn">Se probaron los cuatro métodos sin respuesta.</Notice>);
    expect(screen.getByRole('status').getAttribute('data-tone')).toBe('warn');
  });
});
