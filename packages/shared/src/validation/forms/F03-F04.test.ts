import { describe, expect, it } from 'vitest';
import { loginSchema } from './F03.ts';
import { changePasswordSchema, RECOVERY_CODE_ALPHABET, recoverSchema, recoveryCodeSchema } from './F04.ts';

// T029-T030 · ui-spec §6 F-03 y F-04, RF-AUT-06, RF-REC-02.
const issues = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => [i.path.join('.'), i.message]);

describe('F-03 Iniciar sesión', () => {
  it('usuario y contraseña no vacíos; mantener sesión es opcional y falso por defecto', () => {
    expect(loginSchema.parse({ username: 'ilen.fernandez', password: 'x' })).toEqual({
      username: 'ilen.fernandez',
      password: 'x',
      keepSignedIn: false,
    });
  });

  it('vacíos se rechazan con su mensaje', () => {
    expect(issues(loginSchema.safeParse({ username: ' ', password: '' }))).toEqual([
      ['username', 'Escriba el usuario.'],
      ['password', 'Escriba la contraseña.'],
    ]);
  });

  it('el usuario se compara en minúsculas y sin espacios en los extremos', () => {
    expect(loginSchema.parse({ username: ' Ilen.Fernandez ', password: 'x' }).username).toBe('ilen.fernandez');
  });
});

describe('F-04 Código de recuperación (XXXX-XXXX sin caracteres confusibles)', () => {
  it('el alfabeto no tiene 0, O, 1, I ni L', () => {
    expect(['0', 'O', '1', 'I', 'L'].filter((c) => RECOVERY_CODE_ALPHABET.includes(c))).toEqual([]);
    expect(RECOVERY_CODE_ALPHABET).toHaveLength(31);
  });

  it.each([
    ['K7QM-3XTP', 'K7QM-3XTP'],
    ['k7qm-3xtp', 'K7QM-3XTP'],
    [' K7QM3XTP ', 'K7QM-3XTP'],
  ])('%s se acepta como %s', (raw, normalized) => {
    expect(recoveryCodeSchema.parse(raw)).toBe(normalized);
  });

  it.each(['K7QM-3XT', 'K7QM-3XTPP', 'K0QM-3XTP', 'KIQM-3XTP', ''])('%s se rechaza', (raw) => {
    expect(issues(recoveryCodeSchema.safeParse(raw))).toEqual([
      ['', 'El código tiene la forma XXXX-XXXX, como K7QM-3XTP.'],
    ]);
  });
});

describe('F-04 Recuperar contraseña', () => {
  const valid = {
    username: 'ilen.fernandez',
    nationalId: '84011905548',
    phone: '+53 52345678',
    code: 'k7qm-3xtp',
    password: 'nueva-clave',
    confirm: 'nueva-clave',
  };

  it('normaliza el teléfono y el código', () => {
    expect(recoverSchema.parse(valid)).toEqual({
      username: 'ilen.fernandez',
      nationalId: '84011905548',
      phone: '52345678',
      code: 'K7QM-3XTP',
      password: 'nueva-clave',
    });
  });

  it('las contraseñas distintas se marcan en la confirmación', () => {
    expect(issues(recoverSchema.safeParse({ ...valid, confirm: 'otra-clave' }))).toEqual([
      ['confirm', 'Las contraseñas no coinciden.'],
    ]);
  });
});

describe('F-04 Cambio de contraseña (P-05)', () => {
  it('la nueva debe ser distinta de la actual', () => {
    expect(
      issues(
        changePasswordSchema.safeParse({ current: 'clave-vieja', password: 'clave-vieja', confirm: 'clave-vieja' }),
      ),
    ).toEqual([['password', 'La nueva contraseña debe ser distinta de la actual.']]);
  });

  it('la actual no puede estar vacía', () => {
    expect(
      issues(changePasswordSchema.safeParse({ current: '', password: 'clave-nueva', confirm: 'clave-nueva' })),
    ).toEqual([['current', 'Escriba la contraseña actual.']]);
  });

  it('válido devuelve la actual y la nueva', () => {
    expect(
      changePasswordSchema.parse({ current: 'clave-vieja', password: 'clave-nueva', confirm: 'clave-nueva' }),
    ).toEqual({
      current: 'clave-vieja',
      password: 'clave-nueva',
    });
  });
});
