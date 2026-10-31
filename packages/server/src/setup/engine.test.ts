import { describe, expect, it } from 'vitest';
import { runSteps, undoSteps, type Journal, type JournalData, type SetupEvent, type Step } from './engine.ts';

// T126 · DT-17 y plan §10.3: pasos idempotentes con diario; un fallo en cualquier paso y Deshacer deja la PC como
// estaba; ejecutar dos veces no duplica nada. La «PC» es un conjunto de cosas creadas y lo que ya había antes.

function pc(existing: string[] = []) {
  const things = new Set(existing);
  const created: string[] = [];
  let failing: string | null = null;
  const step = (id: string): Step => ({
    id,
    title: id,
    async run() {
      if (failing === id) throw new Error(`falló ${id}`);
      if (things.has(id)) return { mine: false };
      things.add(id);
      created.push(id);
      return { mine: true };
    },
    async undo(info) {
      if (info.mine) things.delete(id);
    },
  });
  let saved: JournalData | null = null;
  const journal: Journal = {
    load: async () => (saved ? (JSON.parse(JSON.stringify(saved)) as JournalData) : null),
    save: async (d) => {
      saved = JSON.parse(JSON.stringify(d)) as JournalData;
    },
  };
  const events: SetupEvent[] = [];
  return {
    things,
    created,
    journal,
    events,
    report: (e: SetupEvent) => events.push(e),
    steps: ['copiar', 'base', 'servicio-base', 'migrar', 'identidad', 'servicio', 'firewall', 'energia'].map(step),
    fail: (id: string | null) => (failing = id),
  };
}

describe('crear', () => {
  it('ejecuta los pasos en orden, avisa de cada uno y los anota en el diario', async () => {
    const p = pc();
    expect(await runSteps('create', p.steps, p.journal, p.report)).toEqual({ ok: true });
    expect(p.created).toEqual([
      'copiar',
      'base',
      'servicio-base',
      'migrar',
      'identidad',
      'servicio',
      'firewall',
      'energia',
    ]);
    expect(p.events.slice(0, 2)).toEqual([
      { type: 'step', id: 'copiar', status: 'running' },
      { type: 'step', id: 'copiar', status: 'done' },
    ]);
    expect((await p.journal.load())!.steps.map((s) => s.status)).toEqual(Array(8).fill('done'));
  });

  it('ejecutar dos veces seguidas no duplica nada', async () => {
    const p = pc();
    await runSteps('create', p.steps, p.journal, p.report);
    await runSteps('create', p.steps, p.journal, p.report);
    expect(p.created).toHaveLength(8);
  });

  it('se detiene en el que falla y reintentar sigue desde ahí', async () => {
    const p = pc();
    p.fail('identidad');
    expect(await runSteps('create', p.steps, p.journal, p.report)).toEqual({
      ok: false,
      step: 'identidad',
      error: 'falló identidad',
    });
    expect(p.things.has('servicio')).toBe(false);
    p.fail(null);
    expect(await runSteps('create', p.steps, p.journal, p.report)).toEqual({ ok: true });
    expect(p.created).toHaveLength(8);
  });
});

describe('deshacer', () => {
  it.each(['copiar', 'base', 'servicio-base', 'migrar', 'identidad', 'servicio', 'firewall', 'energia'])(
    'con un fallo en «%s», Deshacer deja la PC como estaba',
    async (failing) => {
      const p = pc(['otra-cosa']);
      p.fail(failing);
      await runSteps('create', p.steps, p.journal, p.report);
      expect(await undoSteps('create', p.steps, p.journal, p.report)).toEqual({ ok: true });
      expect([...p.things]).toEqual(['otra-cosa']);
      expect((await p.journal.load())!.steps).toEqual([]);
    },
  );

  it('lo que ya existía antes no se borra al deshacer', async () => {
    const p = pc(['base']);
    p.fail('servicio');
    await runSteps('create', p.steps, p.journal, p.report);
    await undoSteps('create', p.steps, p.journal, p.report);
    expect([...p.things]).toEqual(['base']);
  });

  it('deshace del último al primero', async () => {
    const p = pc();
    p.fail('migrar');
    await runSteps('create', p.steps, p.journal, p.report);
    p.events.length = 0;
    await undoSteps('create', p.steps, p.journal, p.report);
    expect(p.events.filter((e) => e.type === 'step' && e.status === 'undoing').map((e) => e.id)).toEqual([
      'servicio-base',
      'base',
      'copiar',
    ]);
  });
});

describe('reparar', () => {
  it('rehace los pasos pedidos aunque el diario los dé por hechos, y conserva cómo deshacerlos', async () => {
    const p = pc();
    await runSteps('create', p.steps, p.journal, p.report);
    p.things.delete('firewall');
    await runSteps('create', p.steps, p.journal, p.report, ['copiar', 'servicio', 'firewall']);
    expect(p.things.has('firewall')).toBe(true);
    expect((await p.journal.load())!.steps.find((s) => s.id === 'copiar')!.info).toEqual({ mine: true });
  });
});

describe('el diario es de una operación', () => {
  it('una operación nueva no hereda lo anotado por otra', async () => {
    const p = pc();
    p.fail('base');
    await runSteps('create', p.steps, p.journal, p.report);
    p.fail(null);
    expect(await undoSteps('uninstall', p.steps, p.journal, p.report)).toEqual({ ok: true });
    expect(p.things.has('copiar')).toBe(true);
  });
});
