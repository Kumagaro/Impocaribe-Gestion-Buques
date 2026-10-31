// ui-spec §6 F-07: buque (P-07, P-08, RF-BUQ-01 a 07). Las mismas reglas en la interfaz y en el servidor (DT-25). Que
// el total no baje de lo asignado y que la fecha real no sea futura lo comprueban los datos y el reloj del servidor.
import { z } from 'zod';
import { vesselCode } from '../../domain/numbering.ts';
import { compareTons, parseTons, tonsToApi, TonsParseError } from '../../domain/tons.ts';
import { textSchema } from './F05.ts';
import { reasonSchema } from './F15.ts';

const version = z.number().int().nonnegative();
const ZERO = parseTons('0');
/** numeric(12,3): hasta 999 999 999,999 t. */
const MAX_TONS = parseTons('999999999.999');

/** Toneladas escritas con coma o punto (RF-VAL-07); viajan como texto con 3 decimales ("50000.000"). */
export function tonsSchema(missing: string, { allowZero = false } = {}) {
  return z.string().transform((v, ctx) => {
    if (v.trim() === '') {
      ctx.addIssue({ code: 'custom', message: missing });
      return z.NEVER;
    }
    try {
      const tons = parseTons(v);
      if (compareTons(tons, ZERO) < 0 || (!allowZero && compareTons(tons, ZERO) === 0))
        ctx.addIssue({ code: 'custom', message: `Las toneladas deben ser mayores que 0${allowZero ? ' o 0' : ''}.` });
      else if (compareTons(tons, MAX_TONS) > 0)
        ctx.addIssue({ code: 'custom', message: 'La cantidad es demasiado grande.' });
      else return tonsToApi(tons);
    } catch (err) {
      if (!(err instanceof TonsParseError)) throw err;
      ctx.addIssue({ code: 'custom', message: err.message });
    }
    return z.NEVER;
  });
}

/** Una fecha `AAAA-MM-DD` que existe en el calendario. */
export const dateSchema = z.iso.date({ error: 'Escriba una fecha válida.' });

/** Opcional: vacío es null. */
const optionalDate = z.union([z.literal('').transform(() => null), dateSchema, z.null()]);

/** Un motivo que solo se exige en algunos cambios (el total o la fecha real): vacío es «sin motivo». */
export const optionalReasonSchema = z.union([z.literal('').transform(() => undefined), reasonSchema]).optional();

export const vesselNameSchema = textSchema('Escriba el nombre del buque.', 'El nombre', 2, 60).superRefine((v, ctx) => {
  if (v !== '' && !/^[\p{L}\d][\p{L}\d -]*$/u.test(v))
    ctx.addIssue({ code: 'custom', message: 'El nombre solo admite letras, dígitos, espacios y guiones.' });
  else if (v !== '' && vesselCode(v) === '')
    ctx.addIssue({ code: 'custom', message: 'El nombre debe tener al menos una letra o un dígito.' });
});

const vesselFields = {
  name: vesselNameSchema,
  manifest: textSchema('Escriba el manifiesto.', 'El manifiesto', 1, 20),
  bl: textSchema('Escriba el B/L.', 'El B/L', 1, 30),
  port: textSchema('Escriba el puerto y la terminal.', 'El puerto y la terminal', 3, 100),
  internalBuyer: textSchema('Escriba el comprador interno.', 'El comprador interno', 3, 150),
  etaDate: optionalDate,
  totalTons: tonsSchema('Escriba el total del buque en toneladas.'),
};

/** Alta (RF-BUQ-01): la fecha real puede venir ya, si el buque llegó. */
export const vesselSchema = z.object({ ...vesselFields, arrivalDate: optionalDate });

/** Edición (RF-BUQ-05): el motivo es obligatorio si cambia el total; lo decide el servidor, que conoce el anterior. */
export const editVesselSchema = z.object({ ...vesselFields, reason: optionalReasonSchema, expectedVersion: version });

/** Registrar o corregir la fecha de arribo real (RF-BUQ-03, 07): corregirla pide motivo. */
export const arrivalSchema = z.object({
  arrivalDate: dateSchema,
  reason: optionalReasonSchema,
  expectedVersion: version,
});

/** Cerrar el buque (RF-BUQ-08). */
export const closeVesselSchema = z.object({ expectedVersion: version });

/** F-07: la fecha real no puede ser futura (en La Habana). `today` es la fecha del servidor. */
export function arrivalDateIssue(arrivalDate: string, today: string): string | undefined {
  return arrivalDate > today ? 'La fecha de arribo real no puede ser futura.' : undefined;
}

/** F-07, advertencia: la fecha estimada ya pasó y no hay fecha real. */
export function etaWarning(etaDate: string | null, arrivalDate: string | null, today: string): string | undefined {
  return etaDate && !arrivalDate && etaDate < today
    ? 'La fecha estimada ya pasó; ¿registrar el arribo real?'
    : undefined;
}
