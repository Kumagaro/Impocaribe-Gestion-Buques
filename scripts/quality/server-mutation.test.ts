import { describe, expect, it } from 'vitest';
import { needsServerMutation } from './server-mutation.ts';

// Plan §11.3: la mutación de los módulos críticos del servidor corre en verify solo cuando la tarea los toca
// (o toca sus pruebas); la completa corre cada noche en CI.
const MUTATE = ['src/sync/**/*.ts', 'src/http/idempotency.ts', '!src/**/*.test.ts'];

describe('needsServerMutation', () => {
  it.each([
    [['packages/server/src/sync/change-log.ts'], true],
    [['packages/server/src/http/idempotency.ts'], true],
    [['packages/server/src/sync/change-log.int.test.ts'], true], // una prueba de un módulo crítico puede debilitarse
    [['packages/server/src/http/idempotency.int.test.ts'], true],
    [['packages/server/stryker.config.mjs'], true], // cambia qué se muta
    [['packages/server/src/health.controller.ts'], false],
    [['packages/server/src/http/device.guard.ts'], false],
    [['packages/shared/src/domain/tons.ts'], false],
    [['docs/desarrollo.md', 'specs/MVP/tasks.md'], false],
    [[], false],
  ])('%j → %s', (changed, expected) => {
    expect(needsServerMutation(changed, MUTATE)).toBe(expected);
  });
});
