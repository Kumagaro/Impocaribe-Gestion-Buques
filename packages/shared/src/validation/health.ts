// GET /health: lo usa la app para comprobar que llega al servidor y para medir la diferencia de hora (plan §6).
import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  serverTime: z.iso.datetime(),
});
