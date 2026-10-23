import { describe, expect, it } from 'vitest';
import { AUDIT_GROUPS, AUDIT_GROUP_PREFIXES, auditActionLabel, auditGroupOf } from './auditActions.ts';

// T104 · RF-BIT-01, 03.
describe('acciones de la bitácora', () => {
  it.each([
    ['order.issue', 'Emitir orden'],
    ['vessel.surplus.loss', 'Registrar merma'],
    ['client.deactivate', 'Desactivar cliente'],
    ['truck.create', 'Crear camión'],
    ['driver.edit', 'Editar chofer'],
    ['client.borrar', 'client.borrar'],
    ['backup.run', 'backup.run'],
  ])('%s → %s', (action, label) => {
    expect(auditActionLabel(action)).toBe(label);
  });

  it.each([
    ['order.correct', 'order'],
    ['allocation.assign', 'declaration'],
    ['carrier.edit', 'catalog'],
    ['session.login', 'access'],
    ['settings.edit', 'company'],
    ['alert.attend', 'alert'],
    ['backup.run', null],
  ])('%s es del grupo %s', (action, group) => {
    expect(auditGroupOf(action)).toBe(group);
  });

  it('cada grupo tiene su nombre y sus prefijos', () => {
    expect(Object.keys(AUDIT_GROUP_PREFIXES)).toEqual(Object.keys(AUDIT_GROUPS));
  });
});
