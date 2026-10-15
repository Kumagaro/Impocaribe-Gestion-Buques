// GET /health: lo usa la app para comprobar que llega al servidor y para medir la diferencia de hora (plan §6).
import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  serverTime: z.iso.datetime(),
});

/** GET /discovery (DT-20): la identidad pública del servidor, sin sesión ni dispositivo. */
export const discoveryResponseSchema = z.object({
  serverId: z.uuid(),
  name: z.string().regex(/^IMPOCARIBE-[0-9A-F]{4}$/),
  version: z.string(),
  caFingerprint: z.string(),
});
