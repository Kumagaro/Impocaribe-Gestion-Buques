import { describe, expect, it } from 'vitest';
import { backupPasswordSchema, emergencyResetSchema, setBackupPasswordSchema } from './F16.ts';

// T105 · F-16.
const issues = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => [i.path.join('.'), i.message]);

describe('F-16 contraseña de respaldo', () => {
  it('al menos 12 caracteres y las dos iguales', () => {
    expect(issues(setBackupPasswordSchema.safeParse({ password: 'corta', confirm: 'corta' }))).toEqual([
      ['password', 'La contraseña de respaldo debe tener al menos 12 caracteres (tiene 5).'],
    ]);
    expect(
      issues(setBackupPasswordSchema.safeParse({ password: 'respaldo 2026 A', confirm: 'respaldo 2026 B' })),
    ).toEqual([['confirm', 'Las dos contraseñas no coinciden.']]);
    expect(
      setBackupPasswordSchema.parse({ current: '', password: 'respaldo 2026 A', confirm: 'respaldo 2026 A' }),
    ).toEqual({
      current: undefined,
      password: 'respaldo 2026 A',
    });
  });

  it('para confirmar o restaurar basta con que no esté vacía', () => {
    expect(issues(backupPasswordSchema.safeParse({ password: '' }))).toEqual([
      ['password', 'Escriba la contraseña de respaldo.'],
    ]);
    expect(backupPasswordSchema.safeParse({ password: 'x' }).success).toBe(true);
  });
});

// T128 · F-16 y RF-INS-11: el restablecimiento de emergencia.
describe('F-16 restablecimiento de emergencia', () => {
  it('Apoderada, contraseña temporal confirmada y código; la confirmación no viaja', () => {
    expect(
      emergencyResetSchema.parse({
        username: 'ilen.fernandez',
        password: 'temporal-2026',
        confirm: 'temporal-2026',
        code: 'k7qm3xtpr2hw',
      }),
    ).toEqual({ username: 'ilen.fernandez', password: 'temporal-2026', code: 'K7QM-3XTP-R2HW' });
  });

  it('cada campo dice qué falta', () => {
    expect(issues(emergencyResetSchema.safeParse({ username: '', password: 'corta', confirm: '', code: 'X' }))).toEqual(
      [
        ['username', 'Elija la Apoderada.'],
        ['password', 'La contraseña debe tener al menos 8 caracteres (tiene 5).'],
        ['code', 'El código tiene la forma XXXX-XXXX-XXXX, como K7QM-3XTP-R2HW.'],
      ],
    );
    expect(
      issues(
        emergencyResetSchema.safeParse({
          username: 'ilen.fernandez',
          password: 'temporal-2026',
          confirm: 'temporal-2027',
          code: 'K7QM-3XTP-R2HW',
        }),
      ),
    ).toEqual([['confirm', 'Las contraseñas no coinciden.']]);
  });
});
