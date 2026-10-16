import { describe, expect, it } from 'vitest';
import {
  fullNameSchema,
  nationalIdSchema,
  newUserSchema,
  passwordPairSchema,
  phoneSchema,
  roleSchema,
  setupSchema,
  usernameSchema,
} from './F02.ts';

// T027 · ui-spec §6 F-02, RF-USR-01, RF-AUT-06 y RF-VAL-03 (mensajes concretos con el valor esperado).
const issues = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.message);

describe('F-02 Teléfono (RF-USR-01: 8 dígitos, +53 opcional, se guarda sin prefijo)', () => {
  it.each([
    ['52345678', '52345678'],
    ['+53 52345678', '52345678'],
    ['+5352345678', '52345678'],
    ['5234 5678', '52345678'],
    [' +53 5234 5678 ', '52345678'],
  ])('%s se guarda como %s', (raw, stored) => {
    expect(phoneSchema.parse(raw)).toBe(stored);
  });

  it.each([
    ['5234567', 'El teléfono debe tener 8 dígitos (tiene 7).'],
    ['523456789', 'El teléfono debe tener 8 dígitos (tiene 9).'],
    ['+53 5234567', 'El teléfono debe tener 8 dígitos (tiene 7).'],
    ['5234-5678', 'El teléfono solo admite dígitos, con +53 delante si lo desea.'],
    ['', 'Escriba el teléfono.'],
  ])('%s se rechaza: %s', (raw, message) => {
    expect(issues(phoneSchema.safeParse(raw))).toEqual([message]);
  });
});

describe('F-02 Carné de identidad (11 dígitos)', () => {
  it.each([
    ['84011905548', []],
    ['8401190554', ['El carné debe tener 11 dígitos (tiene 10).']],
    ['840119055481', ['El carné debe tener 11 dígitos (tiene 12).']],
    ['8401190554A', ['El carné solo admite dígitos.']],
    ['', ['Escriba el carné de identidad.']],
  ])('%s → %j', (raw, expected) => {
    expect(issues(nationalIdSchema.safeParse(raw))).toEqual(expected);
  });
});

describe('F-02 Nombre y apellidos', () => {
  it.each([
    ['Ana', []],
    ["Ilén Fernández-O'Neil", []],
    ['a'.repeat(100), []],
    ['Al', ['El nombre debe tener entre 3 y 100 caracteres (tiene 2).']],
    ['a'.repeat(101), ['El nombre debe tener entre 3 y 100 caracteres (tiene 101).']],
    ['Ana 2', ['El nombre solo admite letras, espacios, guiones y apóstrofos.']],
    ['   ', ['Escriba el nombre y los apellidos.']],
  ])('«%s» → %j', (raw, expected) => {
    expect(issues(fullNameSchema.safeParse(raw))).toEqual(expected);
  });

  it('guarda el nombre sin espacios en los extremos', () => {
    expect(fullNameSchema.parse('  Ilén Fernández  ')).toBe('Ilén Fernández');
  });
});

describe('F-02 Usuario', () => {
  it.each([
    ['ilen.fernandez', []],
    ['a_1', []],
    ['a'.repeat(30), []],
    ['ab', ['El usuario debe tener entre 3 y 30 caracteres (tiene 2).']],
    ['a'.repeat(31), ['El usuario debe tener entre 3 y 30 caracteres (tiene 31).']],
    ['Ilen', ['El usuario solo admite minúsculas, dígitos, punto y guion bajo.']],
    ['ilén', ['El usuario solo admite minúsculas, dígitos, punto y guion bajo.']],
    ['ilen fernandez', ['El usuario solo admite minúsculas, dígitos, punto y guion bajo.']],
    ['', ['Escriba el usuario.']],
  ])('«%s» → %j', (raw, expected) => {
    expect(issues(usernameSchema.safeParse(raw))).toEqual(expected);
  });
});

describe('F-02 Rol', () => {
  it('admite los tres roles y nada más', () => {
    expect(['apoderada', 'operador', 'lectura'].map((r) => roleSchema.safeParse(r).success)).toEqual([
      true,
      true,
      true,
    ]);
    expect(issues(roleSchema.safeParse('admin'))).toEqual(['Elija un rol: Apoderada, Operador o Solo lectura.']);
  });
});

describe('F-02 Contraseña y confirmación (RF-AUT-06: al menos 8 caracteres)', () => {
  it('8 caracteres iguales se aceptan', () => {
    expect(passwordPairSchema.safeParse({ password: '12345678', confirm: '12345678' }).success).toBe(true);
  });

  it('7 caracteres se rechazan con el número exacto', () => {
    expect(issues(passwordPairSchema.safeParse({ password: '1234567', confirm: '1234567' }))).toEqual([
      'La contraseña debe tener al menos 8 caracteres (tiene 7).',
    ]);
  });

  it('distintas: el error va en la confirmación', () => {
    const r = passwordPairSchema.safeParse({ password: '12345678', confirm: '12345679' });
    expect(r.success ? [] : r.error.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['confirm', 'Las contraseñas no coinciden.'],
    ]);
  });
});

describe('F-02 Alta de usuario y primer arranque', () => {
  const base = {
    fullName: 'Mario Delgado Pérez',
    username: 'mario.delgado',
    nationalId: '84011905548',
    phone: '+53 52345678',
    password: 'contraseña1',
    confirm: 'contraseña1',
  };

  it('el alta normaliza el teléfono y exige el rol', () => {
    expect(newUserSchema.parse({ ...base, role: 'operador' })).toEqual({
      fullName: 'Mario Delgado Pérez',
      username: 'mario.delgado',
      nationalId: '84011905548',
      phone: '52345678',
      role: 'operador',
      password: 'contraseña1',
    });
    expect(issues(newUserSchema.safeParse(base))).toEqual(['Elija un rol: Apoderada, Operador o Solo lectura.']);
  });

  it('en el primer arranque el rol no se elige: siempre es Apoderada', () => {
    expect(setupSchema.parse({ ...base, role: 'lectura' })).toEqual({
      fullName: 'Mario Delgado Pérez',
      username: 'mario.delgado',
      nationalId: '84011905548',
      phone: '52345678',
      role: 'apoderada',
      password: 'contraseña1',
    });
  });

  it('informa cada campo por su ruta (details.fields del servidor)', () => {
    const r = newUserSchema.safeParse({ ...base, role: 'operador', nationalId: '123', phone: '1' });
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join('.'))).toEqual(['nationalId', 'phone']);
  });
});
