import { describe, expect, it } from 'vitest';
import { confirmWordSchema, reasonSchema } from './F15.ts';

// T023 · ui-spec §6 F-15: motivo de 10 a 500 caracteres; palabra de confirmación exacta en mayúsculas (RF-VAL-03).
const issues = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.message);

describe('F-15 Motivo', () => {
  it.each([
    ['a'.repeat(10), []],
    ['a'.repeat(500), []],
    ['a'.repeat(9), ['El motivo debe tener al menos 10 caracteres (tiene 9).']],
    ['a'.repeat(501), ['El motivo admite como máximo 500 caracteres (tiene 501).']],
    ['', ['Escriba el motivo: es obligatorio y queda en la bitácora.']],
  ])('«%s…» → %j', (value, expected) => {
    expect(issues(reasonSchema.safeParse(value))).toEqual(expected);
  });

  it('cuenta los caracteres sin los espacios de los extremos', () => {
    expect(issues(reasonSchema.safeParse('   corto    '))).toEqual(['El motivo debe tener al menos 10 caracteres (tiene 5).']);
    expect(reasonSchema.parse('  Cancelada en el Excel  ')).toBe('Cancelada en el Excel');
  });
});

describe('F-15 Palabra de confirmación', () => {
  it('acepta la palabra exacta', () => {
    expect(issues(confirmWordSchema('RESTAURAR').safeParse('RESTAURAR'))).toEqual([]);
  });

  it.each(['restaurar', 'RESTAURA', ' RESTAURAR', ''])('rechaza «%s»', (value) => {
    expect(issues(confirmWordSchema('RESTAURAR').safeParse(value))).toEqual(['Escriba exactamente RESTAURAR, en mayúsculas.']);
  });
});
