// T101 y T103 · RF-CON-07, RF-TAB-06, plan §6.2: la búsqueda en el archivo (lo de más de 12 meses, que no está en la
// copia local) y el seguimiento de la DM en PDF.
import { z } from 'zod';

/** Plan §5.9: la copia local guarda 12 meses de lo inactivo; lo anterior se busca en el servidor. */
export const ARCHIVE_MONTHS = 12;
/** Resultados como máximo por búsqueda en el archivo. */
export const ARCHIVE_LIMIT = 50;

export const archiveQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, { error: 'Escriba qué buscar.' })
    .max(60, { error: 'Escriba como máximo 60 caracteres.' }),
});

/** RF-TAB-06: el PDF viaja en base64 dentro del JSON, como el de las órdenes. */
export const trackingFileSchema = z.object({
  fileName: z.string(),
  mime: z.literal('application/pdf'),
  base64: z.string(),
});
