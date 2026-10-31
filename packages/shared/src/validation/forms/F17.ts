// T104 · F-17: filtros de la bitácora (P-25). Las fechas son de La Habana; «desde» no puede ser posterior a «hasta».
import { z } from 'zod';
import { AUDIT_GROUPS, type AuditGroup } from '../../domain/auditActions.ts';

const emptyIsNull = <T extends z.ZodType>(schema: T) =>
  z.union([z.literal('').transform(() => null), schema, z.null()]).optional();

export const auditFilterSchema = z
  .object({
    userId: emptyIsNull(z.uuid()),
    from: emptyIsNull(z.iso.date({ error: 'Escriba una fecha válida.' })),
    to: emptyIsNull(z.iso.date({ error: 'Escriba una fecha válida.' })),
    group: emptyIsNull(z.enum(Object.keys(AUDIT_GROUPS) as [AuditGroup, ...AuditGroup[]])),
    /** Número de DM (00431) o de orden, completo o su parte final (42, 0042). */
    ref: z
      .string()
      .trim()
      .max(30, { error: 'Escriba como máximo 30 caracteres.' })
      .transform((v) => v.toUpperCase() || null)
      .nullable()
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.from && v.to && v.from > v.to)
      ctx.addIssue({ code: 'custom', path: ['to'], message: '«Hasta» no puede ser anterior a «desde».' });
  });
export type AuditFilter = z.output<typeof auditFilterSchema>;
