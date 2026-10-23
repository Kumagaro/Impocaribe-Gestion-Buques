import { describe, expect, it } from 'vitest';
import { backupPasswordSchema, setBackupPasswordSchema } from './F16.ts';

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
