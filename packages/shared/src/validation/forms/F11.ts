// ui-spec §6 F-11: cliente y sus destinatarios (P-19, RF-CAT-01). Las mismas reglas en la interfaz y en el servidor
// (DT-25). La unicidad del nombre normalizado y el aviso de parecidos (ADV-05) se comprueban contra los datos.
import { z } from 'zod';
import { textSchema } from './F05.ts';

const version = z.number().int().nonnegative();

export const recipientSchema = z.object({
  /** Sin id, un destinatario nuevo; con id, uno que ya existe (se edita o se desactiva). */
  id: z.uuid().optional(),
  name: textSchema('Escriba el nombre del destinatario.', 'El nombre del destinatario', 3, 150),
  address: textSchema('Escriba la dirección de destino.', 'La dirección', 5, 250),
  active: z.boolean().optional(),
});

const clientFields = {
  name: textSchema('Escriba el nombre del cliente.', 'El nombre', 3, 150),
  recipients: z.array(recipientSchema).min(1, { error: 'Agregue al menos un destinatario.' }),
};

export const clientSchema = z.object(clientFields);
export const editClientSchema = z.object({ ...clientFields, expectedVersion: version });
