import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimatedIcon } from './AnimatedIcon';
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
