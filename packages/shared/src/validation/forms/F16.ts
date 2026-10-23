// T105 · F-16: la contraseña de respaldo (al definirla o cambiarla) y la que se escribe para confirmarla o restaurar.
import { z } from 'zod';

export const BACKUP_PASSWORD_MIN = 12;
export const BACKUP_PASSWORD_WARNING = 'Si la pierde, los respaldos no se podrán recuperar. Guárdela impresa';

const newPassword = z.string().superRefine((v, ctx) => {
  if (v.length < BACKUP_PASSWORD_MIN)
    ctx.addIssue({
      code: 'custom',
      message: `La contraseña de respaldo debe tener al menos ${BACKUP_PASSWORD_MIN} caracteres (tiene ${v.length}).`,
    });
});
const typed = z.string().refine((v) => v !== '', { message: 'Escriba la contraseña de respaldo.' });

/** Definirla (la primera vez) o cambiarla (`current` obligatoria si ya hay una; lo comprueba el servidor). */
export const setBackupPasswordSchema = z
  .object({ current: z.string().optional(), password: newPassword, confirm: z.string() })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirm)
      ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Las dos contraseñas no coinciden.' });
  })
  .transform(({ current, password }) => ({ current: current || undefined, password }));

/** Confirmarla cada 90 días o escribirla para restaurar. */
export const backupPasswordSchema = z.object({ password: typed });

export const backupPasswordStatusSchema = z.object({
  defined: z.boolean(),
  setAt: z.iso.datetime().nullable(),
  confirmedAt: z.iso.datetime().nullable(),
  /** Hay que pedirla ahora, al iniciar sesión. */
  due: z.boolean(),
  postponesLeft: z.number().int().nonnegative(),
});
export type BackupPasswordStatus = z.infer<typeof backupPasswordStatusSchema>;
