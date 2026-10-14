import { describe, expect, it } from 'vitest';
import * as P from './presets';
import type { MotionPreset } from './presets';

// T022 · ui-spec §3 (MOV-01 a MOV-10), RF-UI-05, RF-UI-06 y Const. art. XIV.3-4. Duraciones máximas copiadas de la tabla
// de ui-spec §3; donde la tabla no fija una, rige el máximo general de 300 ms de la constitución.
const DEVICES = ['phone', 'tablet', 'desktop'] as const;

const presets = (reduced: boolean): [string, MotionPreset, number][] => [
  ['MOV-01 teléfono', P.pageTransition('phone', reduced), 250],
  ['MOV-01 tablet', P.pageTransition('tablet', reduced), 220],
  ['MOV-01 escritorio', P.pageTransition('desktop', reduced), 180],
  ['MOV-02 fila', P.listItem(reduced), 250],
  ['MOV-04 hoja (teléfono)', P.sheet(reduced), 300],
  ['MOV-04 diálogo', P.dialog(reduced), 200],
  ['MOV-06 toque', P.press(reduced), 300],
  ['MOV-07 éxito', P.busyToSuccess(reduced), 300],
  ['MOV-10 paso', P.stepSlide(reduced), 250],
];

const MOVING = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate'];
const ALLOWED = new Set([...MOVING, 'opacity']);
const targets = (p: MotionPreset) =>
  [p.initial, p.animate, p.exit, p.whileTap].filter(Boolean) as Record<string, unknown>[];

describe('Const. art. XIV.3: duración máxima de cada patrón', () => {
  it.each(presets(false))('%s no supera su máximo', (_name, preset, maxMs) => {
    expect((preset.transition?.duration ?? 0) * 1000).toBeLessThanOrEqual(maxMs);
  });

  it.each(DEVICES.map((d) => [d] as const))('MOV-01 usa la duración exacta de ui-spec en %s', (device) => {
    const expected = { phone: 0.25, tablet: 0.22, desktop: 0.18 }[device];
    expect(P.pageTransition(device, false).transition?.duration).toBe(expected);
  });

  it('MOV-03 número vivo: 400 ms', () => {
    expect(P.numberTween(false)).toEqual({ duration: 0.4 });
  });

  it('MOV-02: una fila cambiada por otro usuario se resalta 1,5 s', () => {
    expect(P.liveRowHighlight(false).holdMs).toBe(1500);
  });
});

describe('ui-spec §3: solo se animan posición, escala y opacidad', () => {
  it.each([...presets(false), ...presets(true)])('%s', (_name, preset) => {
    const props = targets(preset).flatMap((t) => Object.keys(t));
    expect(props.filter((p) => !ALLOWED.has(p))).toEqual([]);
  });
});

describe('RF-UI-06: variante reducida', () => {
  it.each(presets(true))('%s: sin desplazamiento ni escala y como mucho un fundido de 100 ms', (_name, preset) => {
    const moving = targets(preset).flatMap((t) => Object.keys(t).filter((k) => MOVING.includes(k)));
    expect(moving).toEqual([]);
    expect((preset.transition?.duration ?? 0) * 1000).toBeLessThanOrEqual(100);
  });

  it('MOV-03 reducido: cambio instantáneo', () => {
    expect(P.numberTween(true)).toEqual({ duration: 0 });
  });

  it('MOV-02 reducido: el resaltado dura igual 1,5 s pero sin animarse', () => {
    expect(P.liveRowHighlight(true)).toEqual({ holdMs: 1500, fade: { duration: 0 } });
  });

  it('MOV-09 reducido: esqueleto sin brillo', () => {
    expect(P.skeletonShimmer(true)).toEqual({});
  });

  it('MOV-03 barras: resorte con movimiento, instantáneo reducido', () => {
    expect(P.progressSpring(false)).toMatchObject({ type: 'spring' });
    expect(P.progressSpring(true)).toEqual({ duration: 0 });
  });

  it('MOV-06 reducido: sin escala al pulsar', () => {
    expect(P.press(true).whileTap).toBeUndefined();
  });
});

describe('con movimiento', () => {
  it('MOV-01 en teléfono entra desde la derecha', () => {
    expect(P.pageTransition('phone', false)).toMatchObject({ initial: { x: '100%' }, animate: { x: 0 } });
  });

  it('MOV-04 en tablet y escritorio: escala de 96 % a 100 % con fundido', () => {
    expect(P.dialog(false)).toMatchObject({ initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 } });
  });

  it('MOV-06: los botones se reducen al 97 % al pulsar', () => {
    expect(P.press(false).whileTap).toEqual({ scale: 0.97 });
  });

  it('MOV-09: el brillo recorre el esqueleto sin parar', () => {
    expect(P.skeletonShimmer(false)).toMatchObject({ animate: { x: ['-100%', '100%'] } });
  });
});

describe('T024 · movimientos de la validación (MOV-11 y MOV-13)', () => {
  it('MOV-11: tres oscilaciones horizontales en 200 ms', () => {
    const shake = P.fieldShake(false);
    const x = shake.animate?.x as number[];
    // Cada oscilación es una ida a la izquierda y otra a la derecha; empieza y acaba en reposo.
    const extremes = x.slice(1, -1);
    const alternates = extremes.every((v, i) => i === 0 || Math.sign(v) === -Math.sign(extremes[i - 1] as number));
    expect([shake.transition?.duration, extremes.length / 2, alternates, x[0], x[x.length - 1]]).toEqual([
      0.2,
      3,
      true,
      0,
      0,
    ]);
  });

  it('MOV-13: el resumen baja desde arriba en 220 ms como máximo', () => {
    expect(P.summaryDrop(false)).toMatchObject({ initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 0 } });
    expect((P.summaryDrop(false).transition?.duration ?? 0) * 1000).toBeLessThanOrEqual(220);
  });

  it.each([
    ['MOV-11', P.fieldShake(true)],
    ['MOV-13', P.summaryDrop(true)],
  ])('%s reducido: sin movimiento', (_name, preset) => {
    expect(preset).toEqual({ transition: { duration: 0 } });
  });
});
