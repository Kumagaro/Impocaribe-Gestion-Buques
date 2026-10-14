// ui-spec §6 F-15: diálogos de motivo, excepción y confirmación destructiva. Las mismas reglas en interfaz y servidor (DT-25).
import { z } from 'zod';

export const REASON_MIN = 10;
export const REASON_MAX = 500;

/** Motivo de una corrección, anulación, excepción o reactivación: de 10 a 500 caracteres, sin contar los espacios de los extremos. */
export const reasonSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    const n = value.length;
    if (n === 0) ctx.addIssue({ code: 'custom', message: 'Escriba el motivo: es obligatorio y queda en la bitácora.' });
    else if (n < REASON_MIN) ctx.addIssue({ code: 'custom', message: `El motivo debe tener al menos ${REASON_MIN} caracteres (tiene ${n}).` });
    else if (n > REASON_MAX) ctx.addIssue({ code: 'custom', message: `El motivo admite como máximo ${REASON_MAX} caracteres (tiene ${n}).` });
  });

/** Palabra que confirma una acción destructiva ("RESTAURAR", "DESINSTALAR"): exacta y en mayúsculas. */
export function confirmWordSchema(word: string) {
  return z.string().refine((value) => value === word, { message: `Escriba exactamente ${word}, en mayúsculas.` });
}
