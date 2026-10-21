// ui-spec §6 F-08 a F-10: DM (P-11), asignación (P-08, P-10) y destino del sobrante (P-08). Las mismas reglas en la
// interfaz y en el servidor (DT-25). Que el número no exista, que el total no baje de lo cargado y que la asignación
// quepa en el buque lo comprueban los datos (RF-DM-02, 05, RF-ASG-01, 02).
import { z } from 'zod';
import { textSchema } from './F05.ts';
import { tonsSchema } from './F07.ts';
import { reasonSchema } from './F15.ts';

const version = z.number().int().nonnegative();

/** RF-DM-01: exactamente 5 dígitos, con los ceros a la izquierda. */
export const declarationNumberSchema = z.string().superRefine((v, ctx) => {
  if (v === '') return ctx.addIssue({ code: 'custom', message: 'Escriba el número de la DM.' });
  if (!/^\d+$/.test(v)) return ctx.addIssue({ code: 'custom', message: 'El número de DM solo admite dígitos.' });
  if (v.length !== 5)
    ctx.addIssue({ code: 'custom', message: `El número de DM debe tener 5 dígitos (tiene ${v.length}).` });
});

const brandSchema = textSchema('Escriba la marca.', 'La marca', 2, 60);
/** Opcional: vacío es «pendiente de total» (null). */
const optionalTotal = z.union([
  z.literal('').transform(() => null),
  z.null(),
  tonsSchema('Escriba el total en toneladas.'),
]);

const tons = tonsSchema('Escriba las toneladas.');

/** F-09: asignar a un buque. Si supera lo libre, se reenvía con `confirmPartial` y el motivo (RF-ASG-02). */
export const allocationSchema = z
  .object({
    vesselId: z.uuid({ error: 'Elija el buque.' }),
    tons,
    confirmPartial: z.boolean().optional(),
    reason: z.union([z.literal('').transform(() => undefined), reasonSchema]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.confirmPartial && !v.reason)
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Escriba el motivo: es obligatorio y queda en la bitácora.',
      });
  });

/** F-08, alta: la fecha la pone el servidor (RF-DM-01); la asignación inicial es opcional (RF-DM-03). */
export const declarationSchema = z.object({
  number: declarationNumberSchema,
  clientId: z.uuid({ error: 'Elija el cliente.' }),
  brand: brandSchema,
  totalTons: optionalTotal,
  allocation: allocationSchema.optional(),
});

/** F-08, edición (RF-DM-04): solo el total y la marca, con motivo. */
export const editDeclarationSchema = z.object({
  brand: brandSchema,
  totalTons: optionalTotal,
  reason: reasonSchema,
  expectedVersion: version,
});

/** RF-PLZ-04. */
export const reactivateDeclarationSchema = z.object({ reason: reasonSchema, expectedVersion: version });

/** RF-ASG-03: cambiar una asignación (puede bajar hasta lo cargado), con motivo. */
export const editAllocationSchema = z.object({
  tons: tonsSchema('Escriba las toneladas.', { allowZero: true }),
  reason: reasonSchema,
  expectedVersion: version,
});

export const SURPLUS_KINDS = ['allocate', 'transfer', 'loss'] as const;
export type SurplusKind = (typeof SURPLUS_KINDS)[number];

export const SURPLUS_KIND_LABEL: Record<SurplusKind, string> = {
  allocate: 'Asignar a una DM',
  transfer: 'Transferir a otro buque',
  loss: 'Merma o pérdida',
};

/** F-10: destino del sobrante (RF-BUQ-08). La merma solo la registra una Apoderada. */
export const surplusDispositionSchema = z
  .object({
    kind: z.enum(SURPLUS_KINDS, { error: 'Elija el tipo de destino.' }),
    tons,
    targetVesselId: z.union([z.literal('').transform(() => null), z.uuid(), z.null()]).optional(),
    targetDeclarationId: z.union([z.literal('').transform(() => null), z.uuid(), z.null()]).optional(),
    reason: reasonSchema,
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'transfer' && !v.targetVesselId)
      ctx.addIssue({ code: 'custom', path: ['targetVesselId'], message: 'Elija el buque destino.' });
    if (v.kind === 'allocate' && !v.targetDeclarationId)
      ctx.addIssue({ code: 'custom', path: ['targetDeclarationId'], message: 'Elija la DM.' });
  });

/** F-08, advertencia: sin total la DM queda pendiente. */
export const PENDING_TOTAL_WARNING = 'La DM quedará pendiente de total: no se podrá asignar ni emitir órdenes';

/** ADV-06 (F-09): la cantidad supera lo libre del buque; se asignará solo lo libre si se confirma (RF-ASG-02). */
export function exceedsVesselText(number: string, vesselCode: string, excess: string): string {
  return `La DM ${number} supera la cantidad restante del buque ${vesselCode} en ${excess}`;
}
