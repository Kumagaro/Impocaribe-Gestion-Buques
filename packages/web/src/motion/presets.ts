// T022 · Presets de movimiento (plan §7.4): uno por patrón de ui-spec §3, cada uno con su variante reducida (RF-UI-06).
// Solo animan posición, escala, rotación de iconos y opacidad; ninguna transición pasa de 300 ms (Const. art. XIV.3),
// salvo el número vivo (400 ms, MOV-03).
import type { Transition } from 'motion/react';
import { durations as D } from '../ui/tokens';

export type DeviceClass = 'phone' | 'tablet' | 'desktop';
type Target = Record<string, number | string | (number | string)[]>;

export interface MotionPreset {
  initial?: Target;
  animate?: Target;
  exit?: Target;
  whileTap?: Target;
  transition?: Transition & { duration?: number };
}

const EASE_OUT = [0.2, 0, 0, 1] as const;
const s = (ms: number) => ms / 1000;
const instant: MotionPreset = { transition: { duration: 0 } };
const fade = (ms: number): MotionPreset => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: ms / 1000 },
});

/** MOV-01: teléfono, entra desde la derecha (250 ms); tablet, fundido con leve desplazamiento (220); escritorio, fundido (180). */
export function pageTransition(device: DeviceClass, reduced: boolean): MotionPreset {
  if (reduced) return instant;
  if (device === 'phone') {
    return {
      initial: { x: '100%' },
      animate: { x: 0 },
      exit: { x: '100%' },
      transition: { duration: s(D.pagePhone), ease: EASE_OUT },
    };
  }
  if (device === 'tablet') {
    return {
      initial: { opacity: 0, x: 16 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 16 },
      transition: { duration: s(D.pageTablet), ease: EASE_OUT },
    };
  }
  return { ...fade(D.pageDesktop), transition: { duration: s(D.pageDesktop), ease: EASE_OUT } };
}

/** MOV-02: altas con fundido y desplazamiento corto, bajas que se pliegan (250 ms). */
export function listItem(reduced: boolean): MotionPreset {
  if (reduced) return instant;
  return {
    initial: { opacity: 0, y: -8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, scaleY: 0.8 },
    transition: { duration: s(D.listItem), ease: EASE_OUT },
  };
}

/** MOV-02: resaltado de 1,5 s de la fila que cambió otro usuario; reducido, sin animar el final. */
export function liveRowHighlight(reduced: boolean): { holdMs: number; fade: { duration: number } } {
  return { holdMs: D.rowHighlightHold, fade: { duration: reduced ? 0 : s(D.listItem) } };
}

/** MOV-03: saldos y totales que cuentan desde el valor anterior (400 ms). */
export function numberTween(reduced: boolean): { duration: number } {
  return { duration: reduced ? 0 : s(D.number) };
}

/** MOV-03: barras de avance con resorte. */
export function progressSpring(reduced: boolean): Transition {
  return reduced ? { duration: 0 } : { type: 'spring', duration: s(D.progress), bounce: 0.2 };
}

/** MOV-04 en teléfono: la hoja sube desde abajo y se cierra deslizando. */
export function sheet(reduced: boolean): MotionPreset {
  if (reduced) return fade(D.reducedFade);
  return {
    initial: { y: '100%' },
    animate: { y: 0 },
    exit: { y: '100%' },
    transition: { duration: s(D.sheet), ease: EASE_OUT },
  };
}

/** MOV-04 en escritorio: el panel lateral entra desde la derecha (P-17, alertas); reducido, fundido. */
export function panel(reduced: boolean): MotionPreset {
  if (reduced) return fade(D.reducedFade);
  return {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
    transition: { duration: s(D.sheet), ease: EASE_OUT },
  };
}

/** MOV-04 en tablet y escritorio: escala de 96 % a 100 % con fundido (200 ms). */
export function dialog(reduced: boolean): MotionPreset {
  if (reduced) return fade(D.reducedFade);
  return {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
    transition: { duration: s(D.dialog), ease: EASE_OUT },
  };
}

/** MOV-05: el mensaje de error se despliega bajo el campo (150 ms) sin empujar el resto; reducido, instantáneo. */
export function fieldMessage(reduced: boolean): MotionPreset {
  if (reduced) return instant;
  return {
    initial: { opacity: 0, y: -4 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: s(D.message), ease: EASE_OUT },
  };
}

/** MOV-06: botones y tarjetas al 97 % al pulsar; reducido, solo el cambio de color de :active. */
export function press(reduced: boolean): MotionPreset {
  return reduced ? {} : { whileTap: { scale: 0.97 }, transition: { duration: s(D.press) } };
}

/** MOV-07: el icono del botón se convierte en la marca de éxito (300 ms). */
export function busyToSuccess(reduced: boolean): MotionPreset {
  if (reduced) return instant;
  return {
    initial: { opacity: 0, scale: 0.6 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: s(D.success), ease: EASE_OUT },
  };
}

/** MOV-09: brillo que recorre el esqueleto; reducido, sin brillo. */
export function skeletonShimmer(reduced: boolean): MotionPreset {
  if (reduced) return {};
  return {
    animate: { x: ['-100%', '100%'] },
    transition: { duration: s(D.shimmer), repeat: Infinity, ease: 'linear' },
  };
}

/** MOV-10: en teléfono, el paso siguiente entra desde la derecha. */
export function stepSlide(reduced: boolean): MotionPreset {
  if (reduced) return instant;
  return {
    initial: { x: '100%', opacity: 0 },
    animate: { x: 0, opacity: 1 },
    transition: { duration: s(D.step), ease: EASE_OUT },
  };
}

/** MOV-11: el campo con error tiembla en horizontal (3 oscilaciones, 200 ms); reducido, solo cambia el color. */
export function fieldShake(reduced: boolean): MotionPreset {
  if (reduced) return instant;
  return { animate: { x: [0, -4, 4, -4, 4, -4, 4, 0] }, transition: { duration: s(D.shake), ease: 'easeInOut' } };
}

/** MOV-13: el resumen de errores baja desde arriba del formulario (220 ms); reducido, aparece sin más. */
export function summaryDrop(reduced: boolean): MotionPreset {
  if (reduced) return instant;
  return {
    initial: { opacity: 0, y: -10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: s(D.summary), ease: EASE_OUT },
  };
}
