// ui-spec §6 F-06: configuración del sistema (P-23, RF-CFG-02 y 04). Las mismas reglas en la interfaz y en el servidor
// (DT-25); que la carpeta externa exista y admita escritura solo lo puede comprobar el servidor.
import { z } from 'zod';
import { RECOVERY_CODE_ALPHABET } from './F04.ts';
import { textSchema } from './F05.ts';

export const NETWORK_SETUPS = ['router', 'hotspot'] as const;
export type NetworkSetup = (typeof NETWORK_SETUPS)[number];

/** RF-DM-13: el texto por defecto del aviso legal del plazo. */
export const DEFAULT_LEGAL_NOTICE =
  'El plazo que muestra el sistema cuenta desde el registro de esta DM en el sistema. Si la Aduana la emitió antes, ' +
  'el plazo legal real para extraer la mercancía puede vencer antes de lo indicado. Verifique la fecha de emisión en ' +
  'el documento de la Aduana.';

const DAYS = 'Escriba un número entero de 0 a 30.';
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const hourSchema = z.string().regex(HHMM, { message: 'Escriba la hora como hh:mm, por ejemplo 07:00.' });

const settingsFields = {
  // El campo de la interfaz da texto ('3'); la API, un número. Vacío o con coma no es un entero.
  maxLoadingDaysAhead: z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : Number(v.trim())) : v),
    z.number({ error: DAYS }).int({ error: DAYS }).min(0, { error: DAYS }).max(30, { error: DAYS }),
  ),
  workdayStart: hourSchema,
  workdayEnd: hourSchema,
  dailyBackupHour: hourSchema,
  externalBackupDir: z
    .string()
    .trim()
    .refine((v) => v !== '', { message: 'Escriba la carpeta externa del respaldo diario.' }),
  networkSetup: z.enum(NETWORK_SETUPS, { error: 'Elija el montaje de red: router wifi o hotspot de un celular.' }),
  deadlineLegalNotice: textSchema('Escriba el texto del aviso legal.', 'El aviso', 50, 600),
};

/** La jornada de respaldos: el inicio antes del fin. */
const workday = (v: { workdayStart: string; workdayEnd: string }, ctx: z.RefinementCtx) => {
  // hh:mm con dos dígitos: el orden de los textos es el de las horas.
  if (HHMM.test(v.workdayStart) && HHMM.test(v.workdayEnd) && v.workdayStart >= v.workdayEnd)
    ctx.addIssue({
      code: 'custom',
      path: ['workdayEnd'],
      message: 'El fin de la jornada debe ser posterior al inicio (07:00 a 19:00, por ejemplo).',
    });
};

export const settingsSchema = z.object(settingsFields).superRefine(workday);

/** P-23: con la versión que vio el usuario (DT-23). */
export const editSettingsSchema = z
  .object({ ...settingsFields, expectedVersion: z.number().int().nonnegative() })
  .superRefine(workday);

export function loadingDaysWarning(days: number): string | null {
  return days === 0 ? 'Solo se podrá emitir con fecha de carga de hoy' : null;
}

/** Aviso, sin impedir guardar, si el respaldo diario cae dentro de la jornada de trabajo (inicio incluido, fin no). */
export function dailyBackupWarning(hour: string, start: string, end: string): string | null {
  // Solo con las tres horas completas y una jornada válida: mientras se escribe, no hay con qué comparar.
  if (![hour, start, end].every((h) => HHMM.test(h)) || start >= end) return null;
  return hour >= start && hour < end ? 'Coincide con la jornada de trabajo' : null;
}

const CODE = new RegExp(
  `^[${RECOVERY_CODE_ALPHABET}]{4}-[${RECOVERY_CODE_ALPHABET}]{4}-[${RECOVERY_CODE_ALPHABET}]{4}$`,
);

/** XXXX-XXXX-XXXX con el alfabeto de los códigos de recuperación: admite minúsculas y los guiones opcionales. */
export const installationCodeSchema = z
  .string()
  .transform((v) => {
    const raw = v.trim().toUpperCase().replaceAll('-', '');
    return raw.length === 12 ? `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}` : raw;
  })
  .refine((v) => CODE.test(v), { message: 'El código tiene la forma XXXX-XXXX-XXXX, como K7QM-3XTP-R2HW.' });

/** RF-CFG-04: el actual solo se normaliza (lo comprueba el servidor); el nuevo, con su confirmación. */
export const installationCodeChangeSchema = z
  .object({
    currentCode: z
      .string()
      .transform((v) => v.trim().toUpperCase())
      .refine((v) => v !== '', { message: 'Escriba el código de instalación actual.' })
      .transform((v) => installationCodeSchema.safeParse(v).data ?? v),
    newCode: installationCodeSchema,
    confirm: z.string(),
  })
  .superRefine((v, ctx) => {
    const confirm = installationCodeSchema.safeParse(v.confirm).data ?? v.confirm;
    if (CODE.test(v.newCode) && confirm !== v.newCode)
      ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Los códigos no coinciden.' });
  })
  .transform(({ currentCode, newCode }) => ({ currentCode, newCode }));
