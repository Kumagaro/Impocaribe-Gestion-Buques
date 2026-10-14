// T007 · Const. art. XIII.11: modificar o borrar una aserción existente exige explicar el motivo en el commit.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REASON = 'Motivo de cambio de prueba:';
const TEST_FILE = /\.test\.tsx?$/;
const ASSERTION = /\bexpect\s*\(|\.(toBe|toEqual|toStrictEqual|toThrow|toMatch|toContain|toHaveLength)\b/;

/** Archivos de prueba del diff que pierden alguna aserción, si el mensaje no trae el motivo. */
export function checkTestChanges(diff: string, message: string): { ok: boolean; files: string[] } {
  if (message.includes(REASON)) return { ok: true, files: [] };
  const files = new Set<string>();
  let file = '';
  for (const line of diff.split('\n')) {
    const header = line.match(/^diff --git a\/(\S+) b\//);
    if (header) file = header[1]!;
    else if (TEST_FILE.test(file) && line.startsWith('-') && !line.startsWith('---') && ASSERTION.test(line))
      files.add(file);
  }
  return { ok: files.size === 0, files: [...files] };
}

// Uso desde .githooks/commit-msg: node scripts/quality/test-changes.ts <archivo-del-mensaje>
if (import.meta.main) {
  const diff = execFileSync('git', ['diff', '--cached', '-U0', '--diff-filter=MD'], { encoding: 'utf8' });
  const result = checkTestChanges(diff, readFileSync(process.argv[2]!, 'utf8'));
  if (!result.ok) {
    console.error(`Este commit modifica o borra aserciones de pruebas existentes:\n  ${result.files.join('\n  ')}`);
    console.error(
      `Añada al mensaje una línea "${REASON} …" con el requisito que cambió o por qué la prueba estaba mal (Const. art. XIII.11).`,
    );
    process.exit(1);
  }
}
