// T022 · Presets de movimiento (plan §7.4): uno por patrón de ui-spec §3, cada uno con su variante reducida (RF-UI-06).
// Solo animan posición, escala, rotación de iconos y opacidad; ninguna transición pasa de 300 ms (Const. art. XIV.3),
// salvo el número vivo (400 ms, MOV-03).
import type { Transition } from 'motion/react';

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
      transition: { duration: 0.25, ease: EASE_OUT },
    };
  }
  if (device === 'tablet') {
    return {
      initial: { opacity: 0, x: 16 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 16 },
      transition: { duration: 0.22, ease: EASE_OUT },
    };
  }
  return { ...fade(180), transition: { duration: 0.18, ease: EASE_OUT } };
}

/** MOV-02: altas con fundido y desplazamiento corto, bajas que se pliegan (250 ms). */
export function listItem(reduced: boolean): MotionPreset {
  if (reduced) return instant;
  return {
    initial: { opacity: 0, y: -8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, scaleY: 0.8 },
    transition: { duration: 0.25, ease: EASE_OUT },
  };
}

/** MOV-02: resaltado de 1,5 s de la fila que cambió otro usuario; reducido, sin animar el final. */
export function liveRowHighlight(reduced: boolean): { holdMs: number; fade: { duration: number } } {
  return { holdMs: 1500, fade: { duration: reduced ? 0 : 0.25 } };
}

/** MOV-03: saldos y totales que cuentan desde el valor anterior (400 ms). */
export function numberTween(reduced: boolean): { duration: number } {
  return { duration: reduced ? 0 : 0.4 };
}

/** MOV-03: barras de avance con resorte. */
export function progressSpring(reduced: boolean): Transition {
  return reduced ? { duration: 0 } : { type: 'spring', duration: 0.3, bounce: 0.2 };
}

/** MOV-04 en teléfono: la hoja sube desde abajo y se cierra deslizando. */
export function sheet(reduced: boolean): MotionPreset {
  if (reduced) return fade(100);
  return {
    initial: { y: '100%' },
    animate: { y: 0 },
    exit: { y: '100%' },
    transition: { duration: 0.24, ease: EASE_OUT },
  };
}

/** MOV-04 en tablet y escritorio: escala de 96 % a 100 % con fundido (200 ms). */
export function dialog(reduced: boolean): MotionPreset {
  if (reduced) return fade(100);
  return {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
    transition: { duration: 0.2, ease: EASE_OUT },
  };
}

/** MOV-06: botones y tarjetas al 97 % al pulsar; reducido, solo el cambio de color de :active. */
export function press(reduced: boolean): MotionPreset {
  return reduced ? {} : { whileTap: { scale: 0.97 }, transition: { duration: 0.1 } };
}

/** MOV-07: el icono del botón se convierte en la marca de éxito (300 ms). */
export function busyToSuccess(reduced: boolean): MotionPreset {
  if (reduced) return instant;
  return {
    initial: { opacity: 0, scale: 0.6 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.3, ease: EASE_OUT },
  };
}

/** MOV-09: brillo que recorre el esqueleto; reducido, sin brillo. */
export function skeletonShimmer(reduced: boolean): MotionPreset {
  if (reduced) return {};
  return { animate: { x: ['-100%', '100%'] }, transition: { duration: 1.4, repeat: Infinity, ease: 'linear' } };
}

/** MOV-10: en teléfono, el paso siguiente entra desde la derecha. */
export function stepSlide(reduced: boolean): MotionPreset {
  if (reduced) return instant;
  return {
    initial: { x: '100%', opacity: 0 },
    animate: { x: 0, opacity: 1 },
    transition: { duration: 0.25, ease: EASE_OUT },
  };
}
