import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANIMATIONS, AnimatedIcon } from './AnimatedIcon';
import { MotionProvider, useReducedMotionPreference } from './MotionProvider';

// T022 · RF-UI-06 y Const. art. XIV.4: el movimiento se reduce si lo pide el sistema operativo o el usuario en su perfil.
function stubSystemPreference(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  }));
}

function Probe() {
  return <span data-testid="reduced">{String(useReducedMotionPreference())}</span>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MotionProvider', () => {
  it.each([
    [false, false, 'false'],
    [true, false, 'true'], // lo pide el sistema operativo
    [false, true, 'true'], // lo pide el usuario ("Reducir animaciones")
    [true, true, 'true'],
  ])('sistema %s · usuario %s → reducido %s', (system, user, expected) => {
    stubSystemPreference(system);
    render(
      <MotionProvider reduceMotion={user}>
        <Probe />
      </MotionProvider>,
    );
    expect(screen.getByTestId('reduced').textContent).toBe(expected);
  });
});

describe('AnimatedIcon (MOV-08)', () => {
  it.each(['ring', 'spin', 'pulse', 'lock', 'draw'] as const)('con movimiento anima el estado %s', (state) => {
    stubSystemPreference(false);
    render(
      <MotionProvider reduceMotion={false}>
        <AnimatedIcon name="bell" state={state} label="Alertas" />
      </MotionProvider>,
    );
    expect(screen.getByRole('img', { name: 'Alertas' }).getAttribute('data-motion')).toBe(state);
  });

  it.each(['ring', 'spin', 'pulse', 'lock', 'draw'] as const)(
    'con movimiento reducido el icono %s queda estático',
    (state) => {
      stubSystemPreference(false);
      render(
        <MotionProvider reduceMotion>
          <AnimatedIcon name="bell" state={state} label="Alertas" />
        </MotionProvider>,
      );
      expect(screen.getByRole('img', { name: 'Alertas' }).getAttribute('data-motion')).toBe('static');
    },
  );

  it('sin etiqueta es decorativo y queda oculto para el lector de pantalla', () => {
    stubSystemPreference(false);
    const { container } = render(
      <MotionProvider reduceMotion={false}>
        <AnimatedIcon name="sync" state="spin" />
      </MotionProvider>,
    );
    expect(container.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });
});

describe('AnimatedIcon: duraciones y preferencia del sistema', () => {
  it('ui-spec §3: los cambios de estado duran como mucho 300 ms; girar y latir son bucles continuos', () => {
    const ms = (s: keyof typeof ANIMATIONS) =>
      Math.round(((ANIMATIONS[s] as { transition?: { duration?: number } }).transition?.duration ?? 0) * 1000);
    expect([ms('ring'), ms('lock'), ms('draw')]).toEqual([300, 200, 200]);
    expect([ANIMATIONS.spin.transition.repeat, ANIMATIONS.pulse.transition.repeat]).toEqual([Infinity, Infinity]);
  });

  it.each(['bell', 'sync', 'offline', 'lock', 'check'] as const)(
    'si el sistema pide reducir movimiento, el icono %s queda estático aunque el usuario no lo pida',
    (name) => {
      stubSystemPreference(true);
      render(
        <MotionProvider reduceMotion={false}>
          <AnimatedIcon name={name} state="ring" label="Icono" />
        </MotionProvider>,
      );
      expect(screen.getByRole('img', { name: 'Icono' }).getAttribute('data-motion')).toBe('static');
    },
  );
});
