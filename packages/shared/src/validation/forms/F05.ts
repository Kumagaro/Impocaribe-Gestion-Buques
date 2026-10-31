// ui-spec §6 F-05: empresa, firma oficial y cuño oficial (P-22, RF-EMP-02 y 06). Las mismas reglas en la interfaz y en
// el servidor (DT-25). Las imágenes viajan en base64 dentro del JSON: así la firma del dispositivo (DT-24) y la
// idempotencia (DT-22) usan el mismo cuerpo de texto que el resto de la API.
import { z } from 'zod';
import { imageInfo } from '../../domain/imageInfo.ts';

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_MIN_WIDTH = 300;
export const IMAGE_MIN_HEIGHT = 100;
export const IMAGE_TRANSPARENCY_WARNING = 'Se recomienda fondo transparente';

/** Texto obligatorio, sin los espacios de los extremos, entre `min` y `max` caracteres. */
export function textSchema(missing: string, name: string, min: number, max: number) {
  return z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      if (v === '') ctx.addIssue({ code: 'custom', message: missing });
      else if (v.length < min || v.length > max)
        ctx.addIssue({
          code: 'custom',
          message: `${name} debe tener entre ${min} y ${max} caracteres (tiene ${v.length}).`,
        });
    });
}

const companyFields = {
  legalName: textSchema('Escriba la razón social.', 'La razón social', 3, 150),
  address: textSchema('Escriba la dirección.', 'La dirección', 5, 250),
};

export const companySchema = z.object(companyFields);

/** P-22: con la versión que vio el usuario (DT-23). */
export const editCompanySchema = z.object({ ...companyFields, expectedVersion: z.number().int().nonnegative() });

/** El mensaje de una imagen que pesa más de 2 MB. */
export function imageTooBig(bytes: number): string {
  return `La imagen pesa ${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB; el máximo es 2 MB.`;
}

/** El problema de una imagen de firma o cuño, o null si sirve: PNG o JPG, hasta 2 MB, al menos 300 × 100 px. */
export function officialImageIssue(bytes: Uint8Array): string | null {
  const info = imageInfo(bytes);
  if (!info) return 'La imagen debe ser PNG o JPG.';
  if (bytes.length > IMAGE_MAX_BYTES) return imageTooBig(bytes.length);
  if (info.width < IMAGE_MIN_WIDTH || info.height < IMAGE_MIN_HEIGHT)
    return `La imagen mide ${info.width} × ${info.height} px; debe medir al menos ${IMAGE_MIN_WIDTH} × ${IMAGE_MIN_HEIGHT} px.`;
  return null;
}

/** Los bytes de una imagen en base64, o null si el texto no es base64. */
export function decodeBase64(value: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export const imageSchema = z.string().superRefine((v, ctx) => {
  if (v === '') return ctx.addIssue({ code: 'custom', message: 'Elija la imagen.' });
  // El peso sale del largo del texto: una imagen enorme no se decodifica (se valida en cada tecla del formulario).
  const size = Math.floor((v.length * 3) / 4) - (v.endsWith('==') ? 2 : v.endsWith('=') ? 1 : 0);
  if (size > IMAGE_MAX_BYTES) return ctx.addIssue({ code: 'custom', message: imageTooBig(size) });
  const bytes = decodeBase64(v);
  const issue = bytes ? officialImageIssue(bytes) : 'La imagen debe ser PNG o JPG.';
  if (issue) ctx.addIssue({ code: 'custom', message: issue });
});

export const credentialNoSchema = z
  .string()
  .trim()
  .superRefine((v, ctx) => {
    if (v === '') return ctx.addIssue({ code: 'custom', message: 'Escriba el número de credencial.' });
    if (!/^\d+$/.test(v)) return ctx.addIssue({ code: 'custom', message: 'La credencial solo admite dígitos.' });
    if (v.length > 20)
      ctx.addIssue({ code: 'custom', message: `La credencial admite como máximo 20 dígitos (tiene ${v.length}).` });
  });

/** RF-EMP-02: la imagen y los datos del representante que se imprimen junto a ella. */
export const signatureSchema = z.object({
  image: imageSchema,
  representativeName: textSchema('Escriba el nombre del representante.', 'El representante', 3, 100),
  credentialNo: credentialNoSchema,
  position: textSchema('Escriba el cargo.', 'El cargo', 2, 60),
});

export const stampSchema = z.object({ image: imageSchema });
