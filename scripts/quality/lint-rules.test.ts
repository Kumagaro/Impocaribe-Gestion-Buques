import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// T007 · plan §11.3: cada barrera de lint rechaza su ejemplo prohibido y deja pasar el uso correcto.
const eslint = new ESLint({ cwd: fileURLToPath(new URL('../..', import.meta.url)) });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result!.messages.map((m) => m.ruleId ?? m.message);
}

const TEST_FILE = 'packages/shared/src/domain/example.test.ts';
const PROD_FILE = 'packages/server/src/example.service.ts';

describe('lint de pruebas (Const. art. XIII.4)', () => {
  it.each([
    ['it.skip', "import { it } from 'vitest';\nit.skip('x', () => {});"],
    ['it.only', "import { it } from 'vitest';\nit.only('x', () => {});"],
    ['it.todo', "import { it } from 'vitest';\nit.todo('x');"],
    ['describe.skip', "import { describe } from 'vitest';\ndescribe.skip('x', () => {});"],
    ['test.skipIf', "import { test } from 'vitest';\ntest.skipIf(true)('x', () => {});"],
    ['expect.anything()', "import { expect } from 'vitest';\nexpect({ a: 1 }).toEqual({ a: expect.anything() });"],
    ['toBeTruthy', "import { expect } from 'vitest';\nexpect(1).toBeTruthy();"],
    ['toBeDefined', "import { expect } from 'vitest';\nexpect(1).toBeDefined();"],
    ['try/catch', "try { JSON.parse('x'); } catch { /* nada */ }"],
  ])('rechaza %s en un archivo de prueba', async (_name, code) => {
    expect(await ruleIds(code, TEST_FILE)).toContain('no-restricted-syntax');
  });

  it('acepta una aserción exacta', async () => {
    const code = "import { expect, it } from 'vitest';\nit('x', () => { expect(1 + 1).toBe(2); });";
    expect(await ruleIds(code, TEST_FILE)).toEqual([]);
  });
});

describe('lint de producción', () => {
  it('rechaza consultar NODE_ENV fuera de la configuración', async () => {
    const code = "export const esPrueba = process.env.NODE_ENV === 'test';";
    expect(await ruleIds(code, PROD_FILE)).toContain('no-restricted-syntax');
  });

  it('permite NODE_ENV en el módulo de configuración', async () => {
    const code = 'export const env = process.env.NODE_ENV;';
    expect(await ruleIds(code, 'packages/server/src/config.ts')).toEqual([]);
  });

  it('rechaza importar los datos de los escenarios de prueba', async () => {
    const code = "import excel from '../../../fixtures/impocaribe-2026-09.json';\nexport { excel };";
    expect(await ruleIds(code, PROD_FILE)).toContain('no-restricted-imports');
  });
});

describe('dominio con aritmética exacta (Const. art. V)', () => {
  it.each([
    ['parseFloat', "export const t = parseFloat('17.280');"],
    ['Number()', "export const t = Number('17.280');"],
  ])('rechaza %s en shared/src/domain', async (_name, code) => {
    expect(await ruleIds(code, 'packages/shared/src/domain/tons.ts')).toContain('no-restricted-syntax');
  });
});

describe('presentaciones sin lógica (plan §7.3)', () => {
  it.each([
    ['el cliente de API', "import { api } from '../../api/client';\nexport { api };"],
    ['el repositorio local', "import { db } from '../../local/db';\nexport { db };"],
    ['los esquemas de validación', "import { f08 } from '@impocaribe/shared/validation';\nexport { f08 };"],
    ['los permisos', "import { can } from '@impocaribe/shared/permissions';\nexport { can };"],
  ])('una presentación de teléfono no puede importar %s', async (_name, code) => {
    expect(await ruleIds(code, 'packages/web/src/screens/dm/Dm.phone.tsx')).toContain('no-restricted-imports');
  });

  it('el hook de la pantalla sí puede importarlos', async () => {
    const code = "import { api } from '../../api/client';\nexport { api };";
    expect(await ruleIds(code, 'packages/web/src/screens/dm/useDm.ts')).toEqual([]);
  });
});

describe('movimiento barato (ui-spec §3)', () => {
  it.each(['height', 'width', 'top', 'backgroundColor', 'boxShadow'])('rechaza animar %s', async (prop) => {
    const code = `export const preset = { animate: { ${prop}: 10 } };`;
    expect(await ruleIds(code, 'packages/web/src/motion/presets.ts')).toContain('no-restricted-syntax');
  });

  it('acepta posición, escala y opacidad', async () => {
    const code =
      'export const preset = { initial: { opacity: 0, x: 16, scale: 0.96 }, animate: { opacity: 1, x: 0, scale: 1 } };';
    expect(await ruleIds(code, 'packages/web/src/motion/presets.ts')).toEqual([]);
  });
});

describe('integración sin simulaciones (Const. art. XIII.4)', () => {
  it.each(['mock', 'spyOn'])('rechaza vi.%s en una prueba de integración', async (fn) => {
    const code = `import { vi } from 'vitest';\nvi.${fn}('./db');`;
    expect(await ruleIds(code, 'packages/server/src/audit/audit.int.test.ts')).toContain('no-restricted-syntax');
  });
});
