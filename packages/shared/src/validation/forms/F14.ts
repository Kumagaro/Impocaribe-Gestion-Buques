// ui-spec §6 F-14: nueva orden y corregir (P-13, P-16), y anular (F-15). Las mismas reglas en la interfaz y en el
// servidor (DT-25). Las reglas que dependen de los datos (saldo, capacidad, fechas, transportista) las aplica
// `domain/orderRules.ts`.
import { z } from 'zod';
import { dateSchema, tonsSchema } from './F07.ts';
import { reasonSchema } from './F15.ts';

const version = z.number().int().positive();
const id = (missing: string) => z.uuid({ error: missing });

/** Opcional, hasta `max` caracteres: vacío es null. */
const optionalText = (name: string, max: number, upper = false) =>
  z.preprocess(
    (v) => v ?? '',
    z
      .string()
      .trim()
      .transform((v) => (upper ? v.toUpperCase().replace(/\s+/g, '') : v))
      .superRefine((v, ctx) => {
        if (v.length > max)
          ctx.addIssue({
            code: 'custom',
            message: `${name} admite como máximo ${max} caracteres (tiene ${v.length}).`,
          });
      })
      .transform((v) => (v === '' ? null : v)),
  );

export const waybillSchema = z
  .string()
  .trim()
  .toUpperCase()
  .superRefine((v, ctx) => {
    if (v === '') return ctx.addIssue({ code: 'custom', message: 'Escriba el número de la carta de porte.' });
    if (!/^[A-Z0-9]+$/.test(v))
      return ctx.addIssue({ code: 'custom', message: 'La carta de porte solo admite letras y dígitos.' });
    if (v.length > 20)
      ctx.addIssue({
        code: 'custom',
        message: `La carta de porte admite como máximo 20 caracteres (tiene ${v.length}).`,
      });
  });

/** Decisiones de excepción (RF-ORD-13, F-15): capacidad de los remolques y camión repetido el mismo día. */
export const overridesSchema = z.object({
  capacity: reasonSchema.optional(),
  sameDay: reasonSchema.optional(),
});

const orderFields = {
  recipientId: id('Elija el destinatario.'),
  truckId: id('Elija el camión.'),
  trailerIds: z.array(z.uuid()).superRefine((ids, ctx) => {
    if (ids.length === 0) ctx.addIssue({ code: 'custom', message: 'Elija al menos un remolque.' });
    else if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Un remolque no puede repetirse.' });
  }),
  driverId: id('Elija el chofer.'),
  tons: tonsSchema('Escriba las toneladas.'),
  waybillNo: waybillSchema,
  loadingDate: dateSchema,
  lotNo: optionalText('El LOT', 20),
  routeSheetNo: optionalText('La hoja de ruta', 20),
  container: optionalText('El contenedor', 15, true),
  overrides: overridesSchema.optional(),
};

/** P-13: emitir. `draftId`, si la orden sale de un borrador del servidor. */
export const issueOrderSchema = z.object({
  declarationId: id('Elija la DM.'),
  allocationId: id('Elija el buque.'),
  ...orderFields,
  draftId: z.uuid().optional(),
});

/** P-16: corregir. La DM y el buque no cambian (RF-ORD-18): ni se aceptan. */
export const correctOrderSchema = z.object({ ...orderFields, reason: reasonSchema, expectedVersion: version });

/** P-16: anular, con la versión vigente que vio el usuario. */
export const voidOrderSchema = z.object({ reason: reasonSchema, expectedVersion: version });

const loose = z.string().max(200);
/** RF-ORD-06 a 08: lo que se lleva escrito, sin validar todavía (se valida al emitir). */
export const draftPayloadSchema = z
  .object({
    declarationId: loose,
    allocationId: loose,
    recipientId: loose,
    carrierId: loose,
    truckId: loose,
    trailerIds: z.array(loose).max(10),
    driverId: loose,
    tons: loose,
    waybillNo: loose,
    loadingDate: loose,
    lotNo: loose,
    routeSheetNo: loose,
    container: loose,
  })
  .partial();
export type DraftPayload = z.infer<typeof draftPayloadSchema>;
