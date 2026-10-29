// T105 · F-16: la contraseña de respaldo (al definirla o cambiarla) y la que se escribe para confirmarla o restaurar.
import { z } from 'zod';
import { confirmMatches, dropConfirm, passwordSchema } from './F02.ts';
import { installationCodeSchema } from './F06.ts';
import { confirmWordSchema } from './F15.ts';

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

/** RF-RES-03: restaurar exige la contraseña de respaldo y escribir «RESTAURAR». */
export const RESTORE_WORD = 'RESTAURAR';
export const restoreSchema = z.object({
  backupId: z.uuid({ error: 'Elija el respaldo.' }),
  password: typed,
  confirm: confirmWordSchema(RESTORE_WORD),
});

export const restoreResultSchema = z.object({
  restoreId: z.uuid(),
  lostOrders: z.number().int().nonnegative(),
  /** T108: no se pudo leer el estado anterior; hay que confirmar la numeración antes de emitir. */
  confirmationRequired: z.boolean(),
});
export type RestoreResult = z.infer<typeof restoreResultSchema>;

/** T108: los buques abiertos con el último número restaurado; `required` mientras no se confirme. */
export const numberingStatusSchema = z.object({
  required: z.boolean(),
  vessels: z.array(z.object({ id: z.uuid(), name: z.string(), code: z.string(), lastOrderSeq: z.number().int() })),
});
export type NumberingStatus = z.infer<typeof numberingStatusSchema>;

/** F-16: el último número impreso de cada buque abierto (≥ al restaurado, lo comprueba el servidor). */
export const confirmNumberingSchema = z.object({
  vessels: z.array(
    z.object({
      vesselId: z.uuid(),
      lastPrinted: z.coerce
        .number({ error: 'Escriba el último número impreso.' })
        .int({ error: 'Escriba un número entero.' })
        .min(0, { error: 'Escriba un número entero.' }),
    }),
  ),
});

/**
 * T128 · F-16 y RF-INS-11: el restablecimiento de emergencia en la PC servidor. La Apoderada de la lista, la contraseña
 * temporal (al menos 8 caracteres, con su confirmación) y el código de instalación (lo comprueba el servidor).
 */
export const EMERGENCY_RESET_WARNING = 'Se registrará en la bitácora y se avisará a todas las Apoderadas';
export const emergencyResetSchema = z
  .object({
    username: z.string().min(1, 'Elija la Apoderada.'),
    password: passwordSchema,
    confirm: z.string(),
    code: installationCodeSchema,
  })
  .superRefine(confirmMatches)
  .transform(dropConfirm);
