// T027 · Usuarios (plan §4.2, RF-USR-01). Las reglas de formato vienen del esquema F-02 compartido; aquí, la unicidad,
// que solo la base puede garantizar.
import { AppError, type Clock, type Role } from '@impocaribe/shared';
import type { Tx } from '../audit/audit-log.ts';
import { hashSecret } from '../auth/password.ts';
import { users } from '../db/schema/users.ts';

export interface NewUser {
  fullName: string;
  username: string;
  nationalId: string;
  phone: string;
  role: Role;
  password: string;
}

/** Lo que se devuelve y se replica de un usuario: nunca el hash ni los contadores de seguridad. */
export interface UserDto {
  id: string;
  username: string;
  fullName: string;
  nationalId: string;
  phone: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  rowVersion: number;
}

export const userColumns = {
  id: users.id,
  username: users.username,
  fullName: users.fullName,
  nationalId: users.nationalId,
  phone: users.phone,
  role: users.role,
  active: users.active,
  mustChangePassword: users.mustChangePassword,
  rowVersion: users.rowVersion,
};

/** Traduce las violaciones de unicidad de users a errores del catálogo, con el campo culpable (RF-VAL-04). */
export function uniqueViolation(err: unknown, user: Pick<NewUser, 'username' | 'nationalId'>): never {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const pg = e.code === '23505' ? e : e.cause;
  if (pg?.code === '23505' && pg.constraint === 'users_national_id_unique') {
    const message = `Ya existe un usuario con el carné ${user.nationalId}.`;
    throw new AppError('DUPLICATE_NATIONAL_ID', message, { fields: { nationalId: message } });
  }
  if (pg?.code === '23505' && pg.constraint === 'users_username_unique') {
    throw new AppError('VALIDATION_ERROR', 'Hay 1 campo por corregir.', {
      fields: { username: `Ya existe el usuario ${user.username}: elija otro nombre.` },
    });
  }
  throw err;
}

export async function createUser(
  tx: Tx,
  clock: Clock,
  input: NewUser,
  options: { mustChangePassword?: boolean } = {},
): Promise<UserDto> {
  const now = clock.now();
  const { password, ...data } = input;
  try {
    const [user] = await tx
      .insert(users)
      .values({
        ...data,
        passwordHash: await hashSecret(password),
        mustChangePassword: options.mustChangePassword ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .returning(userColumns);
    return user!;
  } catch (err) {
    return uniqueViolation(err, input);
  }
}
