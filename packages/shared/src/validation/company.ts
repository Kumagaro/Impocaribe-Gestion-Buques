// T051 y T052 · Respuestas de la API de empresa y configuración (plan §6.2). Las usan el servidor (@Contract) y web.
// La firma y el cuño no se replican (plan §4.4): se consultan en línea, solo las Apoderadas.
import { z } from 'zod';
import { NETWORK_SETUPS } from './forms/F06.ts';

/** RF-EMP-06: null hasta que una Apoderada los escribe por primera vez. */
export const companyDtoSchema = z.object({
  legalName: z.string().nullable(),
  address: z.string().nullable(),
  rowVersion: z.number().int().positive(),
});
export type CompanyDto = z.infer<typeof companyDtoSchema>;

const imageMime = z.enum(['image/png', 'image/jpeg']);

/** Una versión anterior: quién y cuándo, sin la imagen (P-22, historial). */
const historyItem = z.object({ id: z.uuid(), createdAt: z.iso.datetime(), createdBy: z.string() });

export const signatureVersionSchema = historyItem.extend({
  representativeName: z.string(),
  credentialNo: z.string(),
  position: z.string(),
});

export const signatureResponseSchema = z.object({
  /** La vigente, con la imagen en base64; null si aún no se cargó. */
  current: signatureVersionSchema.extend({ image: z.string(), mime: imageMime }).nullable(),
  /** Todas, de la más reciente a la más antigua, incluida la vigente. */
  history: z.array(signatureVersionSchema),
});
export type SignatureResponse = z.infer<typeof signatureResponseSchema>;

export const stampResponseSchema = z.object({
  current: historyItem.extend({ image: z.string(), mime: imageMime }).nullable(),
  history: z.array(historyItem),
});
export type StampResponse = z.infer<typeof stampResponseSchema>;

/** RF-EMP-04: sin firma o sin cuño no se puede oficializar ni corregir. */
export const officialStatusSchema = z.object({ signature: z.boolean(), stamp: z.boolean() });

/** RF-CFG-02. La carpeta externa es null hasta que una Apoderada la elige. */
export const settingsDtoSchema = z.object({
  maxLoadingDaysAhead: z.number().int(),
  workdayStart: z.string(),
  workdayEnd: z.string(),
  dailyBackupHour: z.string(),
  externalBackupDir: z.string().nullable(),
  networkSetup: z.enum(NETWORK_SETUPS),
  deadlineLegalNotice: z.string(),
  rowVersion: z.number().int().positive(),
});
export type SettingsDto = z.infer<typeof settingsDtoSchema>;
