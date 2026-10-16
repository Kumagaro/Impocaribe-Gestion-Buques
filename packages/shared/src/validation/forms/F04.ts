// ui-spec §6 F-04: recuperar la contraseña (P-04) y cambiarla desde el perfil (P-05).
import { z } from 'zod';
import { confirmMatches, dropConfirm, nationalIdSchema, PASSWORD_MIN, passwordSchema, phoneSchema } from './F02.ts';

/** Letras y dígitos sin los que se confunden al copiar a mano: 0/O, 1/I/L. */
export const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE = new RegExp(`^[${RECOVERY_CODE_ALPHABET}]{4}-[${RECOVERY_CODE_ALPHABET}]{4}$`);

/** XXXX-XXXX: admite minúsculas y el guion opcional, y lo devuelve en la forma impresa. */
export const recoveryCodeSchema = z
  .string()
  .transform((v) => {
    const raw = v.trim().toUpperCase().replace('-', '');
    return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  })
  .refine((v) => CODE.test(v), { message: 'El código tiene la forma XXXX-XXXX, como K7QM-3XTP.' });

export const recoverSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => v !== '', { message: 'Escriba el usuario.' }),
    nationalId: nationalIdSchema,
    phone: phoneSchema,
    code: recoveryCodeSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .superRefine(confirmMatches)
  .transform(dropConfirm);

export const changePasswordSchema = z
  .object({
    current: z.string().refine((v) => v !== '', { message: 'Escriba la contraseña actual.' }),
    password: passwordSchema,
    confirm: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.password.length >= PASSWORD_MIN && v.current !== '' && v.password === v.current)
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'La nueva contraseña debe ser distinta de la actual.',
      });
    else confirmMatches(v, ctx);
  })
  .transform(dropConfirm);
