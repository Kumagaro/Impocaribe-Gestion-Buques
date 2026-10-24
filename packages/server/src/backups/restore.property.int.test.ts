import fc from 'fast-check';
import { ManualClock } from '@impocaribe/shared';
import { describe, expect, it, vi } from 'vitest';
import { useScenario } from '../../test/scenario.ts';

// T110 · D12, contra PostgreSQL real con pg_dump y pg_restore reales: ninguna secuencia de emitir, respaldar y restaurar
// (a cualquier respaldo de la secuencia) reutiliza un número de orden ya emitido. Cada restauración tarda unos segundos:
// pocas corridas y secuencias cortas.
vi.setConfig({ testTimeout: 900_000 });

const START = '2026-10-23T14:00:00.000Z';
const clock = new ManualClock(START);
const { post, call, login, forOrders } = useScenario(clock, START);
const PASSWORD = 'respaldo de prueba 2026';
const OVERRIDES = { sameDay: 'Otro viaje del día autorizado por la terminal' };

type Op = { kind: 'issue' } | { kind: 'backup' } | { kind: 'restore'; pick: number };

describe('T110 · propiedad de la restauración (D12)', () => {
  it('ningún número de orden se repite, haya las restauraciones que haya', async () => {
    await call('ana', 'PUT', '/backups/password', { password: PASSWORD, confirm: PASSWORD });
    const w = await forOrders();
    // Un respaldo de partida: siempre hay uno al que volver.
    const first = (await post('/backups', {}, 'ana')).body.id as string;
    // Todos los números emitidos, en todas las corridas: volver al respaldo de partida retrocede también esas.
    const issued: number[] = [];

    const op: fc.Arbitrary<Op> = fc.oneof(
      { weight: 3, arbitrary: fc.constant({ kind: 'issue' as const }) },
      { weight: 1, arbitrary: fc.constant({ kind: 'backup' as const }) },
      { weight: 1, arbitrary: fc.nat(10).map((pick) => ({ kind: 'restore' as const, pick })) },
    );
    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 6 }), async (ops) => {
        const backups = [first];
        for (const o of ops) {
          if (o.kind === 'issue') {
            const res = await post('/orders', w.order({ tons: '0,5', overrides: OVERRIDES }));
            expect(res.status).toBe(201);
            const seq = res.body.seq as number;
            // D12: cada número nuevo es mayor que todos los emitidos antes, también los que se perdieron.
            expect(issued.every((n) => seq > n)).toBe(true);
            issued.push(seq);
          } else if (o.kind === 'backup') {
            backups.push((await post('/backups', {}, 'ana')).body.id as string);
          } else {
            const to = backups[o.pick % backups.length]!;
            expect(
              (await post('/restores', { backupId: to, password: PASSWORD, confirm: 'RESTAURAR' }, 'ana')).status,
            ).toBe(200);
            await login();
          }
        }
      }),
      { numRuns: 5 },
    );
  });
});
