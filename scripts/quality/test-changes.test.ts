import { describe, expect, it } from 'vitest';
import { checkTestChanges } from './test-changes.ts';

// T007 · plan §11.3 y Const. art. XIII.11: cambiar una aserción existente exige "Motivo de cambio de prueba:".
const MODIFIED_ASSERTION = [
  'diff --git a/packages/shared/src/domain/tons.test.ts b/packages/shared/src/domain/tons.test.ts',
  '--- a/packages/shared/src/domain/tons.test.ts',
  '+++ b/packages/shared/src/domain/tons.test.ts',
  '@@ -10 +10 @@',
  "-    expect(formatTons(t('0.3'))).toBe('0,300 t');",
  "+    expect(formatTons(t('0.3'))).toBe('0,30 t');",
].join('\n');

const ADDED_ONLY = [
  'diff --git a/packages/shared/src/domain/tons.test.ts b/packages/shared/src/domain/tons.test.ts',
  '--- a/packages/shared/src/domain/tons.test.ts',
  '+++ b/packages/shared/src/domain/tons.test.ts',
  '@@ -20,0 +21,3 @@',
  "+  it('nuevo caso', () => {",
  '+    expect(1).toBe(1);',
  '+  });',
].join('\n');

const DELETED_TEST_FILE = [
  'diff --git a/packages/server/src/x.test.ts b/packages/server/src/x.test.ts',
  'deleted file mode 100644',
  '--- a/packages/server/src/x.test.ts',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  "-it('x', () => {",
  '-  expect(2).toBe(2);',
].join('\n');

describe('checkTestChanges', () => {
  it('rechaza modificar una aserción sin motivo', () => {
    expect(checkTestChanges(MODIFIED_ASSERTION, 'T008: ajusta formato')).toEqual({
      ok: false,
      files: ['packages/shared/src/domain/tons.test.ts'],
    });
  });

  it('acepta modificar una aserción con motivo', () => {
    const msg = 'T008: ajusta formato\n\nMotivo de cambio de prueba: RF-X cambió el formato a 2 decimales.';
    expect(checkTestChanges(MODIFIED_ASSERTION, msg)).toEqual({ ok: true, files: [] });
  });

  it('acepta añadir pruebas nuevas sin motivo', () => {
    expect(checkTestChanges(ADDED_ONLY, 'T008: más casos')).toEqual({ ok: true, files: [] });
  });

  it('rechaza borrar un archivo de pruebas sin motivo', () => {
    expect(checkTestChanges(DELETED_TEST_FILE, 'T009: limpieza')).toEqual({
      ok: false,
      files: ['packages/server/src/x.test.ts'],
    });
  });

  it('ignora líneas eliminadas que no son aserciones', () => {
    const diff = MODIFIED_ASSERTION.replace(
      "-    expect(formatTons(t('0.3'))).toBe('0,300 t');",
      '-  // comentario viejo',
    );
    expect(checkTestChanges(diff, 'T008: comentario')).toEqual({ ok: true, files: [] });
  });
});
