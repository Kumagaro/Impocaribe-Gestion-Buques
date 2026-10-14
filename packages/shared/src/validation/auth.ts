// Peticiones y respuestas de /auth (plan §6.2). El formulario de P-03 usa loginSchema (F-03); la petición le añade el
// dispositivo desde el que se abre la sesión (RF-AUT-03).
import { z } from 'zod';
import { ACTIONS, type Action } from '../domain/permissions.ts';
import { loginSchema } from './forms/F03.ts';
import { userDtoSchema } from './users.ts';

export const PLATFORMS = ['windows', 'android'] as const;

export const deviceFieldsSchema = z.object({
  deviceId: z.string().min(1).max(100),
  deviceLabel: z.string().min(1).max(100),
  platform: z.enum(PLATFORMS),
});

export const loginRequestSchema = loginSchema.extend(deviceFieldsSchema.shape);

export const loginResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.iso.datetime(),
  user: userDtoSchema,
});

export const meResponseSchema = z.object({
  user: userDtoSchema,
  permissions: z.array(z.enum(ACTIONS as [Action, ...Action[]])),
});

export const sessionDtoSchema = z.object({
  id: z.uuid(),
  deviceLabel: z.string(),
  platform: z.enum(PLATFORMS),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  current: z.boolean(),
});
export const sessionsResponseSchema = z.array(sessionDtoSchema);

/** DT-05: token de alertas del servicio nativo de Android. */
export const deviceTokenResponseSchema = z.object({ token: z.string(), expiresAt: z.iso.datetime() });
