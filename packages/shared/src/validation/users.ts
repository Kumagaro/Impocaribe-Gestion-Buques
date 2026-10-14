// Respuestas de la API de usuarios y del primer arranque (plan §6.2). Las usan el servidor (@Contract) y web.
import { z } from 'zod';
import { ROLES } from '../domain/permissions.ts';

export const userDtoSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  fullName: z.string(),
  nationalId: z.string().regex(/^\d{11}$/),
  phone: z.string().regex(/^\d{8}$/),
  role: z.enum(ROLES),
  active: z.boolean(),
  mustChangePassword: z.boolean(),
  rowVersion: z.number().int().positive(),
});
export type UserDto = z.infer<typeof userDtoSchema>;

export const setupStatusSchema = z.object({ configured: z.boolean() });

/** Los códigos de recuperación viajan en claro una sola vez, en esta respuesta (RF-REC-01). */
export const recoveryCodesSchema = z.array(z.string()).length(8);
export const setupResponseSchema = z.object({ user: userDtoSchema, recoveryCodes: recoveryCodesSchema });

export const recoveryCodesResponseSchema = z.object({ recoveryCodes: recoveryCodesSchema });
