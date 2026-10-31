// ui-spec §6 F-12: transportista (P-20, RF-CAT-02). Las mismas reglas en la interfaz y en el servidor (DT-25).
import { z } from 'zod';
import { textSchema } from './F05.ts';

const carrierFields = { name: textSchema('Escriba el nombre del transportista.', 'El nombre', 3, 150) };

export const carrierSchema = z.object(carrierFields);
export const editCarrierSchema = z.object({ ...carrierFields, expectedVersion: z.number().int().nonnegative() });
