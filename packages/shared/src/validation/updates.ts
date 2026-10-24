// T113 · RF-UPD-01 a 05, plan §6.2 (Actualizaciones): las versiones publicadas del instalador ligero y del APK, y los
// instaladores del WebView para P-27. El instalador completo no se publica (va aparte, con el código de instalación).
import { z } from 'zod';
import { isVersion } from '../domain/appVersion.ts';

/** Las dos apps (con versión mínima) y los instaladores del WebView de Android para P-27 (RF-UI-11). */
export const APP_PLATFORMS = ['windows', 'android'] as const;
export const RELEASE_PLATFORMS = [...APP_PLATFORMS, 'android-webview-chrome', 'android-webview-system'] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];
export type ReleasePlatform = (typeof RELEASE_PLATFORMS)[number];
export const releasePlatformSchema = z.enum(RELEASE_PLATFORMS, { error: 'Elija la plataforma.' });

export const PLATFORM_LABELS: Record<ReleasePlatform, string> = {
  windows: 'Windows (instalador ligero)',
  android: 'Android (APK)',
  'android-webview-chrome': 'Chrome para Android (WebView)',
  'android-webview-system': 'Android System WebView',
};

export const versionSchema = z
  .string()
  .trim()
  .refine(isVersion, { error: 'Escriba la versión con tres números separados por puntos, por ejemplo 1.4.2.' });

/** Al publicar: los campos que acompañan al archivo (multipart). */
export const publishReleaseSchema = z.object({
  platform: releasePlatformSchema,
  version: versionSchema,
  notes: z.string().trim().max(2000, { error: 'Las novedades no pueden pasar de 2000 caracteres.' }).default(''),
});
export type PublishRelease = z.infer<typeof publishReleaseSchema>;

export const releaseDtoSchema = z.object({
  id: z.uuid(),
  platform: releasePlatformSchema,
  version: z.string(),
  sha256: z.string(),
  sizeBytes: z.number().int(),
  notes: z.string(),
  /** La versión mínima compatible vigente de su plataforma. */
  isMinSupported: z.boolean(),
  publishedByName: z.string().nullable(),
  publishedAt: z.iso.datetime(),
});
export type ReleaseDto = z.infer<typeof releaseDtoSchema>;

/** RF-UPD-02: lo que pregunta la app al iniciar sesión y cada hora. Una versión mal formada se trata como antigua. */
export const updateCheckQuerySchema = z.object({ platform: releasePlatformSchema, version: z.string() });

export const updateCheckSchema = z.object({
  /** La más nueva publicada, o null si no hay ninguna. */
  latest: z.string().nullable(),
  /** La mínima compatible vigente (la publicada o la del servidor, la mayor), o null si no hay. */
  minSupported: z.string().nullable(),
  /** RF-UPD-04: la instalada está por debajo de la mínima. */
  mustUpdate: z.boolean(),
  /** RF-UPD-03: hay una más nueva que la instalada. */
  updateAvailable: z.boolean(),
  notes: z.string().nullable(),
  /** Relativa al servidor: `/api/v1/updates/<plataforma>/<versión>/download`. */
  downloadUrl: z.string().nullable(),
  sha256: z.string().nullable(),
});
export type UpdateCheck = z.infer<typeof updateCheckSchema>;
