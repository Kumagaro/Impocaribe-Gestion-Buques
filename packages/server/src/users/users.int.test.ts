import { AppError, ManualClock } from '@impocaribe/shared';
import { newUserSchema } from '@impocaribe/shared/validation';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { verifySecret } from '../auth/password.ts';
import { createUser } from './users.repo.ts';

// T027 · RF-USR-01 (carné único de 11 dígitos, teléfono de 8 dígitos guardado sin +53), RF-USR-03 (no se borran).
let suite: SuiteDb;
let db: NodePgDatabase;
const clock = new ManualClock('2026-10-14T12:00:00.000Z');

const input = (over: Record<string, string> = {}) =>
  newUserSchema.parse({
    fullName: 'Mario Delgado Pérez',
    username: 'mario.delgado',
    nationalId: '84011905548',
    phone: '+53 52345678',
    role: 'operador',
    password: 'contraseña1',
    confirm: 'contraseña1',
    ...over,
  });

beforeAll(async () => {
  suite = await createSuiteDb();
  db = drizzle(suite.app);
}, 60_000);

afterAll(async () => {
  await suite.drop();
});

beforeEach(async () => {
  await suite.admin.query('TRUNCATE users CASCADE');
});

describe('RF-USR-01: datos del usuario', () => {
  it('+53 52345678 se guarda como 52345678, con la contraseña en argon2id', async () => {
    const user = await db.transaction((tx) => createUser(tx, clock, input()));
    const { rows } = await suite.admin.query(
      'SELECT username, full_name, national_id, phone, role, active, must_change_password, row_version, created_at FROM users',
    );
    expect(rows.map((r) => ({ ...r, created_at: (r.created_at as Date).toISOString() }))).toEqual([
      {
        username: 'mario.delgado',
        full_name: 'Mario Delgado Pérez',
        national_id: '84011905548',
        phone: '52345678',
        role: 'operador',
        active: true,
        must_change_password: false,
        row_version: 1,
        created_at: '2026-10-14T12:00:00.000Z',
      },
    ]);
    const [{ password_hash: hash }] = (await suite.admin.query('SELECT password_hash FROM users')).rows;
    expect(await verifySecret(hash as string, 'contraseña1')).toBe(true);
    expect(user).toEqual({
      id: user.id,
      username: 'mario.delgado',
      fullName: 'Mario Delgado Pérez',
      nationalId: '84011905548',
      phone: '52345678',
      role: 'operador',
      active: true,
      mustChangePassword: false,
      rowVersion: 1,
    });
  });

  it('la base rechaza un teléfono de 7 dígitos aunque se salte la validación', async () => {
    await expect(
      suite.app.query(
        `INSERT INTO users (username, full_name, national_id, phone, role, password_hash, created_at, updated_at)
         VALUES ('ana.ruiz', 'Ana Ruiz', '84011905548', '5234567', 'operador', 'x', now(), now())`,
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'users_phone_digits' });
  });

  it('la base rechaza un carné que no tenga 11 dígitos', async () => {
    await expect(
      suite.app.query(
        `INSERT INTO users (username, full_name, national_id, phone, role, password_hash, created_at, updated_at)
         VALUES ('ana.ruiz', 'Ana Ruiz', '8401190554 ', '52345678', 'operador', 'x', now(), now())`,
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'users_national_id_digits' });
  });

  it('el carné es único entre usuarios: DUPLICATE_NATIONAL_ID en su campo', async () => {
    await db.transaction((tx) => createUser(tx, clock, input()));
    const error = await db
      .transaction((tx) => createUser(tx, clock, input({ username: 'otro.usuario' })))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).toBody()).toEqual({
      code: 'DUPLICATE_NATIONAL_ID',
      message: 'Ya existe un usuario con el carné 84011905548.',
      details: { fields: { nationalId: 'Ya existe un usuario con el carné 84011905548.' } },
    });
  });

  it('el usuario es único: error en su campo', async () => {
    await db.transaction((tx) => createUser(tx, clock, input()));
    const error = await db
      .transaction((tx) => createUser(tx, clock, input({ nationalId: '85020306548' })))
      .catch((e: unknown) => e);
    expect((error as AppError).toBody()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Hay 1 campo por corregir.',
      details: { fields: { username: 'Ya existe el usuario mario.delgado: elija otro nombre.' } },
    });
  });
});

describe('RF-USR-03: los usuarios no se borran', () => {
  it('la app no puede borrar usuarios', async () => {
    await db.transaction((tx) => createUser(tx, clock, input()));
    await expect(suite.app.query('DELETE FROM users')).rejects.toMatchObject({ code: '42501' });
  });
});
