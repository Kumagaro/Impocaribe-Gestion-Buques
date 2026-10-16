import { describe, expect, it } from 'vitest';
import { appTitle } from './index.ts';

// T003: función de ejemplo del esqueleto; el título viene de ui-spec y tasks.md ("Órdenes de Carga").
describe('appTitle', () => {
  it('devuelve el nombre del sistema', () => {
    expect(appTitle()).toBe('Órdenes de Carga');
  });
});
