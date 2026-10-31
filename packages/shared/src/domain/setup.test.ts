import { describe, expect, it } from 'vitest';
import { applySetupMessage, emptySetupProgress, setupPercent, type SetupMessage, type SetupProgress } from './setup.ts';

// T127 · P-28 paso 4: el estado de la creación se arma con los mensajes del ayudante, en el orden en que llegan.
const PLAN: SetupMessage = {
  type: 'plan',
  steps: [
    { id: 'copiar', title: 'Copiar los componentes del servidor' },
    { id: 'base', title: 'Crear la base de datos' },
  ],
};
const apply = (messages: [SetupMessage, number][]): SetupProgress =>
  messages.reduce((p, [m, at]) => applySetupMessage(p, m, at), emptySetupProgress());

describe('progreso de la creación del servidor', () => {
  it('cada paso pasa de pendiente a en curso y a hecho, con su tiempo; la barra cuenta los hechos', () => {
    const p = apply([
      [PLAN, 0],
      [{ type: 'step', id: 'copiar', status: 'running' }, 1000],
      [{ type: 'log', id: 'copiar', line: 'node.exe copiado' }, 2000],
      [{ type: 'step', id: 'copiar', status: 'done' }, 41_000],
    ]);
    expect(p.steps).toEqual([
      { id: 'copiar', title: 'Copiar los componentes del servidor', state: 'done', startedAt: 1000, endedAt: 41_000 },
      { id: 'base', title: 'Crear la base de datos', state: 'pending' },
    ]);
    expect(p.log).toEqual([{ at: 2000, id: 'copiar', line: 'node.exe copiado' }]);
    expect(setupPercent(p)).toBe(50);
  });

  it('un paso fallido guarda el motivo; al reintentarlo se limpia', () => {
    const failed = apply([
      [PLAN, 0],
      [{ type: 'step', id: 'copiar', status: 'running' }, 1],
      [{ type: 'step', id: 'copiar', status: 'failed', error: 'acceso denegado' }, 5],
      [{ type: 'outcome', outcome: { ok: false, step: 'copiar', error: 'acceso denegado' } }, 6],
    ]);
    expect(failed.steps[0]).toMatchObject({ state: 'failed', error: 'acceso denegado' });
    expect(failed.outcome).toEqual({ ok: false, step: 'copiar', error: 'acceso denegado' });
    const again = applySetupMessage(failed, { type: 'step', id: 'copiar', status: 'running' }, 9);
    expect(again.steps[0]).toEqual({
      id: 'copiar',
      title: 'Copiar los componentes del servidor',
      state: 'running',
      startedAt: 9,
    });
  });

  it('sin plan, la barra está en cero; un plan nuevo borra el resultado anterior', () => {
    expect(setupPercent(emptySetupProgress())).toBe(0);
    const p = apply([
      [{ type: 'outcome', outcome: { ok: true } }, 1],
      [PLAN, 2],
    ]);
    expect(p.outcome).toBeNull();
  });
});
