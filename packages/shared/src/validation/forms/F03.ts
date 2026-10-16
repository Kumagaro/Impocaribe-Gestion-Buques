// ui-spec §6 F-03: iniciar sesión (P-03). El usuario se compara en minúsculas.
import { z } from 'zod';

const nonEmpty = (message: string) => z.string().refine((v) => v !== '', { message });

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().pipe(nonEmpty('Escriba el usuario.')),
  password: nonEmpty('Escriba la contraseña.'),
  keepSignedIn: z.boolean().default(false),
});
