// ui-spec §6 F-02: usuario en el primer arranque (P-02) y en el alta o edición (P-21). Los mismos esquemas en la
// interfaz y en el servidor (DT-25), con mensajes concretos (RF-VAL-03).
import { z } from 'zod';
import { ROLES } from '../../domain/permissions.ts';

export const PASSWORD_MIN = 8;

export const fullNameSchema = z
  .string()
  .trim()
  .superRefine((v, ctx) => {
    if (v === '') return ctx.addIssue({ code: 'custom', message: 'Escriba el nombre y los apellidos.' });
    if (v.length < 3 || v.length > 100)
      return ctx.addIssue({
        code: 'custom',
        message: `El nombre debe tener entre 3 y 100 caracteres (tiene ${v.length}).`,
      });
    if (!/^[\p{L}][\p{L} '’-]*$/u.test(v))
      ctx.addIssue({ code: 'custom', message: 'El nombre solo admite letras, espacios, guiones y apóstrofos.' });
  });

export const usernameSchema = z.string().superRefine((v, ctx) => {
  if (v === '') return ctx.addIssue({ code: 'custom', message: 'Escriba el usuario.' });
  if (v.length < 3 || v.length > 30)
    return ctx.addIssue({
      code: 'custom',
      message: `El usuario debe tener entre 3 y 30 caracteres (tiene ${v.length}).`,
    });
  if (!/^[a-z0-9._]+$/.test(v))
    ctx.addIssue({ code: 'custom', message: 'El usuario solo admite minúsculas, dígitos, punto y guion bajo.' });
});

export const nationalIdSchema = z.string().superRefine((v, ctx) => {
  if (v === '') return ctx.addIssue({ code: 'custom', message: 'Escriba el carné de identidad.' });
  if (!/^\d+$/.test(v)) return ctx.addIssue({ code: 'custom', message: 'El carné solo admite dígitos.' });
  if (v.length !== 11) ctx.addIssue({ code: 'custom', message: `El carné debe tener 11 dígitos (tiene ${v.length}).` });
});

/** RF-USR-01: 8 dígitos con +53 opcional; se guarda sin el prefijo ni los espacios. */
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, ''))
  .superRefine((v, ctx) => {
    if (v === '') return ctx.addIssue({ code: 'custom', message: 'Escriba el teléfono.' });
    const digits = v.startsWith('+53') ? v.slice(3) : v;
    if (!/^\d+$/.test(digits))
      return ctx.addIssue({ code: 'custom', message: 'El teléfono solo admite dígitos, con +53 delante si lo desea.' });
    if (digits.length !== 8)
      ctx.addIssue({ code: 'custom', message: `El teléfono debe tener 8 dígitos (tiene ${digits.length}).` });
  })
  .transform((v) => (v.startsWith('+53') ? v.slice(3) : v));

export const roleSchema = z.enum(ROLES, { error: 'Elija un rol: Apoderada, Operador o Solo lectura.' });

export const passwordSchema = z.string().superRefine((v, ctx) => {
  if (v.length < PASSWORD_MIN)
    ctx.addIssue({
      code: 'custom',
      message: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres (tiene ${v.length}).`,
    });
});

/** El error de "no coinciden" va en la confirmación, y solo si la contraseña ya es válida. */
export function confirmMatches(v: { password: string; confirm: string }, ctx: z.RefinementCtx) {
  if (v.password.length >= PASSWORD_MIN && v.password !== v.confirm)
    ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Las contraseñas no coinciden.' });
}

/** Quita la confirmación: solo sirve para validar, no viaja al servidor ni se guarda. */
export function dropConfirm<T extends { confirm: string }>(v: T): Omit<T, 'confirm'> {
  const out: Partial<T> = { ...v };
  delete out.confirm;
  return out as Omit<T, 'confirm'>;
}

/** Contraseña y confirmación: el error de "no coinciden" va en la confirmación. */
export const passwordPairSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .superRefine(confirmMatches);

const userFields = {
  fullName: fullNameSchema,
  username: usernameSchema,
  nationalId: nationalIdSchema,
  phone: phoneSchema,
};

/** Alta de usuario (P-21). Devuelve los datos ya normalizados, sin la confirmación. */
export const newUserSchema = z
  .object({ ...userFields, role: roleSchema, password: passwordSchema, confirm: z.string() })
  .superRefine(confirmMatches)
  .transform(dropConfirm);

/** Primer arranque (P-02): el rol es siempre Apoderada (RF-USR-05), lo pida quien lo pida. */
export const setupSchema = z
  .object({ ...userFields, password: passwordSchema, confirm: z.string() })
  .superRefine(confirmMatches)
  .transform((v) => ({ ...dropConfirm(v), role: 'apoderada' as const }));

/** Edición de usuario (P-21): los mismos campos, sin contraseña, con la versión que vio el usuario (DT-23). */
export const editUserSchema = z.object({
  ...userFields,
  role: roleSchema,
  expectedVersion: z.number().int().nonnegative(),
});

/** RF-REC-06: contraseña temporal que una Apoderada asigna a otro usuario (F-16, restablecimiento). */
export const resetPasswordSchema = passwordPairSchema.transform(dropConfirm);
