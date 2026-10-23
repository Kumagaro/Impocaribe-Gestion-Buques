import { describe, expect, it } from 'vitest';
import { auditFilterSchema } from './F17.ts';

// T104 · F-17: filtros de la bitácora.
describe('F-17 filtros de la bitácora', () => {
  it('vacío es «sin filtro» y la referencia va en mayúsculas', () => {
    expect(auditFilterSchema.parse({ userId: '', from: '', to: '', group: '', ref: ' eagle1-2026-v1-0042 ' })).toEqual({
      userId: null,
      from: null,
      to: null,
      group: null,
      ref: 'EAGLE1-2026-V1-0042',
    });
    expect(auditFilterSchema.parse({ ref: '  ' }).ref).toBeNull();
  });

  it('«desde» no puede ser posterior a «hasta»', () => {
    const r = auditFilterSchema.safeParse({ from: '2026-10-14', to: '2026-10-01' });
    expect(r.success ? [] : r.error.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['to', '«Hasta» no puede ser anterior a «desde».'],
    ]);
    expect(auditFilterSchema.safeParse({ from: '2026-10-14', to: '2026-10-14' }).success).toBe(true);
  });

  it('rechaza un grupo que no existe y una referencia larga', () => {
    expect(auditFilterSchema.safeParse({ group: 'backup' }).success).toBe(false);
    expect(auditFilterSchema.safeParse({ ref: 'x'.repeat(31) }).success).toBe(false);
  });
});
