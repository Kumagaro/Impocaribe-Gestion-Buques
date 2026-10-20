// ui-spec §6 F-13: camión, remolque y chofer (P-18, RF-CAT-03 a 05 y 09). Las mismas reglas en la interfaz y en el
// servidor (DT-25). Que la chapa, el carné y la licencia no se repitan lo comprueban los datos (RF-CAT-08).
import { z } from 'zod';
import { normalizePlate } from '../../domain/names.ts';
import { compareTons, parseTons, tonsToApi, TonsParseError } from '../../domain/tons.ts';
import { fullNameSchema, nationalIdSchema } from './F02.ts';
import { reasonSchema } from './F15.ts';

const version = z.number().int().nonnegative();
const carrierId = z.uuid({ error: 'Elija el transportista.' });
const MAX_TONS = parseTons('100');
const ZERO = parseTons('0');

/** 5 a 10 letras y dígitos; se guarda en mayúsculas y sin espacios ni guiones. */
export const plateSchema = z
  .string()
  .transform(normalizePlate)
  .superRefine((v, ctx) => {
    if (v === '') return ctx.addIssue({ code: 'custom', message: 'Escriba la chapa.' });
    if (!/^[A-Z0-9]+$/.test(v))
      return ctx.addIssue({ code: 'custom', message: 'La chapa solo admite letras y dígitos.' });
    if (v.length < 5 || v.length > 10)
      ctx.addIssue({
        code: 'custom',
        message: `La chapa debe tener entre 5 y 10 letras y dígitos (tiene ${v.length}).`,
      });
  });

export const licenseSchema = z.string().superRefine((v, ctx) => {
  if (v === '') return ctx.addIssue({ code: 'custom', message: 'Escriba el número de licencia.' });
  if (!/^\d+$/.test(v)) return ctx.addIssue({ code: 'custom', message: 'La licencia solo admite dígitos.' });
  if (v.length !== 11)
    ctx.addIssue({ code: 'custom', message: `La licencia debe tener 11 dígitos (tiene ${v.length}).` });
});

/** RF-CAT-04: toneladas con 3 decimales como máximo, mayor que 0 y hasta 100 t; viajan como texto ("32.500"). */
export const capacitySchema = z.string().transform((v, ctx) => {
  if (v.trim() === '') {
    ctx.addIssue({ code: 'custom', message: 'Escriba la capacidad en toneladas.' });
    return z.NEVER;
  }
  try {
    const tons = parseTons(v);
    if (compareTons(tons, ZERO) <= 0) ctx.addIssue({ code: 'custom', message: 'La capacidad debe ser mayor que 0 t.' });
    else if (compareTons(tons, MAX_TONS) > 0)
      ctx.addIssue({ code: 'custom', message: 'La capacidad admite como máximo 100 t.' });
    else return tonsToApi(tons);
  } catch (err) {
    if (!(err instanceof TonsParseError)) throw err;
    ctx.addIssue({ code: 'custom', message: err.message });
  }
  return z.NEVER;
});

const truckFields = {
  carrierId,
  plate: plateSchema,
  /** Opcional: vacío es null. */
  tractorPlate: z.union([z.literal('').transform(() => null), plateSchema, z.null()]),
  /** "Basificado en": vacío es LA HABANA (RF-CAT-03). */
  baseLocation: z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      if (v.length > 60)
        ctx.addIssue({ code: 'custom', message: `La base admite como máximo 60 caracteres (tiene ${v.length}).` });
    })
    .transform((v) => (v === '' ? 'LA HABANA' : v)),
  trailerIds: z.array(z.uuid()).superRefine((ids, ctx) => {
    if (ids.length === 0)
      ctx.addIssue({ code: 'custom', message: 'Elija al menos un remolque habitual: no hay camiones sin remolque.' });
    else if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Un remolque aparece dos veces.' });
  }),
};
export const truckSchema = z.object(truckFields);
export const editTruckSchema = z.object({ ...truckFields, expectedVersion: version });

const trailerFields = { carrierId, plate: plateSchema, capacityTons: capacitySchema };
export const trailerSchema = z.object(trailerFields);
export const editTrailerSchema = z.object({ ...trailerFields, expectedVersion: version });

const driverFields = { fullName: fullNameSchema, nationalId: nationalIdSchema, licenseNo: licenseSchema };
export const driverSchema = z.object({ ...driverFields, carrierId });
/** El transportista no se edita aquí: su cambio pide motivo (RF-CAT-09). */
export const editDriverSchema = z.object({ ...driverFields, expectedVersion: version });
export const changeDriverCarrierSchema = z.object({ carrierId, reason: reasonSchema, expectedVersion: version });
