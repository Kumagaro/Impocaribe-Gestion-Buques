import { describe, expect, it } from 'vitest';
import { citedIds, invariantIds, screens, specIds, storySlug, trace, type TraceInput } from './trace.ts';

// T142 · Const. art. XIII y XIV: cada requisito tiene una prueba que lo cita y cada pantalla su E2E y sus
// referencias visuales en cada clase de dispositivo.
describe('IDs citados, con sus abreviaturas', () => {
  it('lista con comas, «y» e intervalos con «a»', () => {
    expect([...citedIds('Cubre RF-ORD-13, 17 y 20; RF-ENE-01 a 03')].sort()).toEqual(
      ['RF-ENE-01', 'RF-ENE-02', 'RF-ENE-03', 'RF-ORD-13', 'RF-ORD-17', 'RF-ORD-20'].sort(),
    );
  });

  it('intervalos con la familia repetida: «HU-01 a HU-03», «D1 a D3», «P-01 a P-02»', () => {
    expect([...citedIds('HU-01 a HU-03 · D1 a D3 · P-01 a P-02')].sort()).toEqual(
      ['D1', 'D2', 'D3', 'HU-01', 'HU-02', 'HU-03', 'P-01', 'P-02'].sort(),
    );
  });

  it('un número con unidad detrás no es otro ID', () => {
    expect([...citedIds('RNF-02, 15 % de batería; RF-RED-01 y 8 dispositivos')].sort()).toEqual([
      'RF-RED-01',
      'RNF-02',
    ]);
  });
});

describe('lo que hay que cubrir', () => {
  it('los requisitos de la spec, los invariantes de la Constitución y las pantallas con sus clases', () => {
    expect(
      specIds('- **RF-AUT-01.** Pide usuario.\n- **RNF-02.** Android 7.\n### HU-05 (P1): Iniciar sesión\n'),
    ).toEqual(['RF-AUT-01', 'RNF-02', 'HU-05']);
    expect(invariantIds('| D1 | Saldo… |\n| D10 | Bitácora… |\n')).toEqual(['D1', 'D10']);
    expect(
      screens(
        '### P-01. Conexión (`/conexion`)\n### P-28. Crear servidor (asistente, solo ESC con instalador completo)\n',
      ),
    ).toEqual([
      { id: 'P-01', classes: ['phone', 'tablet', 'desktop'] },
      { id: 'P-28', classes: ['desktop'] },
    ]);
    expect(storySlug('Pantallas/Buques y DM')).toBe('pantallas-buques-y-dm');
  });
});

describe('informe', () => {
  const base: TraceInput = {
    spec: '- **RF-AUT-01.** a\n- **RF-AUT-02.** b\n### HU-01 (P1): c\n',
    constitution: '| D1 | d |\n',
    uiSpec:
      '### P-01. Conexión\n### P-28. Crear servidor (solo ESC)\n### P-31. Aviso de apagado (diálogo de Windows)\n',
    tests: [
      { path: 'a.test.ts', text: '// RF-AUT-01 y 02, D1' },
      { path: 'access.e2e.ts', text: "test('P-01 y HU-01', …)" },
    ],
    stories: [{ path: 'Access.stories.tsx', text: "// P-01\nconst meta = { title: 'Pantallas/Acceso' };" }],
    references: [
      'pantallas-acceso--login--phone--light.png',
      'pantallas-acceso--login--tablet--dark.png',
      'pantallas-acceso--login--desktop--light.png',
    ],
  };

  it('con todo citado y referenciado solo quedan las faltas de las pantallas aún sin hacer', () => {
    expect(trace(base)).toEqual({
      untested: [],
      noE2e: ['P-28'],
      noVisual: [{ id: 'P-28', missing: ['desktop'] }],
      exempt: [{ id: 'P-31', reason: expect.stringContaining('diálogo de Windows') as unknown as string }],
    });
  });

  it('una pantalla exenta solo de E2E sale con su motivo y sigue necesitando sus referencias', () => {
    const r = trace({ ...base, noE2eReasons: { 'P-28': 'pide el permiso de administrador' } });
    expect(r.noE2e).toEqual([]);
    expect(r.exempt.map((e) => e.id)).toEqual(['P-28', 'P-31']);
    expect(r.noVisual).toEqual([{ id: 'P-28', missing: ['desktop'] }]);
  });

  it('un requisito sin prueba, una pantalla sin E2E y una clase sin referencia se informan', () => {
    const r = trace({
      ...base,
      tests: [{ path: 'a.test.ts', text: '// RF-AUT-01' }],
      references: base.references.filter((f) => !f.includes('--tablet--')),
    });
    expect(r.untested).toEqual(['RF-AUT-02', 'HU-01', 'D1']);
    expect(r.noE2e).toEqual(['P-01', 'P-28']);
    expect(r.noVisual).toEqual([
      { id: 'P-01', missing: ['tablet'] },
      { id: 'P-28', missing: ['desktop'] },
    ]);
  });
});
