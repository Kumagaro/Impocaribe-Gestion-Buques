// T142 · Const. art. XIII y XIV: trazabilidad automática. `pnpm trace` falla si:
//   - algún requisito de la spec (RF, RNF, HU) o invariante de la Constitución (D) no lo cita ninguna prueba;
//   - alguna pantalla P-xx de ui-spec.md no tiene prueba de extremo a extremo que la cite, o le faltan referencias
//     visuales en alguna de sus clases de dispositivo.
// Las pruebas citan los IDs en su nombre o en sus comentarios, también abreviados: «RF-ORD-13, 17», «RF-ENE-01 a 05»,
// «D1 a D15», «P-01 a P-04».
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export type DeviceClass = 'phone' | 'tablet' | 'desktop';
const ALL_CLASSES: DeviceClass[] = ['phone', 'tablet', 'desktop'];

/** Pantallas que no son de la interfaz web: no tienen historia ni E2E del navegador. */
export const NOT_WEB: Record<string, string> = {
  'P-27': 'pantalla nativa de Android (WebView antiguo): se prueba en el emulador (T118) y en la lista manual (T143)',
  'P-31': 'diálogo de Windows al apagar: verificación manual en Windows 10 y 11 (T133, T143)',
};

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/**
 * Todos los IDs que cita un texto, con las abreviaturas expandidas. Tras un ID completo, los números que siguen
 * separados por «,», «y», «e» o «a» son de la misma familia; «a» es un intervalo.
 */
export function citedIds(text: string): Set<string> {
  const ids = new Set<string>();
  const head = /\b(RF-[A-Z]{3}-|RNF-|HU-|P-|D)(\d{1,2})\b/g;
  for (const m of text.matchAll(head)) {
    const prefix = m[1]!;
    const width = prefix === 'D' ? 0 : 2;
    let last = Number(m[2]);
    ids.add(`${prefix}${pad(last, width)}`);
    // El siguiente número, solo o con la misma familia delante («HU-01 a HU-18», «D1 a D15»); no uno con unidad.
    const tail = new RegExp(
      `^(\\s*(?:,|\\by\\b|\\be\\b|\\ba\\b)\\s*)(?:${prefix})?(\\d{1,2})\\b(?!\\s*(?:%|t\\b|días|dispositivos|h\\b|min))`,
    );
    let rest = text.slice(m.index! + m[0].length);
    for (let t = tail.exec(rest); t; t = tail.exec(rest)) {
      const n = Number(t[2]);
      if (/\ba\b/.test(t[1]!) && n > last) for (let k = last + 1; k <= n; k++) ids.add(`${prefix}${pad(k, width)}`);
      else ids.add(`${prefix}${pad(n, width)}`);
      last = n;
      rest = rest.slice(t[0].length);
    }
  }
  return ids;
}

/** Los IDs que define la spec: «- **RF-AUT-01.**», «- **RNF-02.**», «### HU-01 …». */
export function specIds(spec: string): string[] {
  const ids = [...spec.matchAll(/^- \*\*((?:RF-[A-Z]{3}|RNF)-\d{2})\.?\*\*/gm), ...spec.matchAll(/^#+ (HU-\d{2})\b/gm)];
  return [...new Set(ids.map((m) => m[1]!))];
}

/** Los invariantes de la tabla de la Constitución: «| D1 | … |». */
export function invariantIds(constitution: string): string[] {
  return [...new Set([...constitution.matchAll(/^\| (D\d{1,2}) \|/gm)].map((m) => m[1]!))];
}

/** Las pantallas de ui-spec.md («### P-28. Crear servidor (… solo ESC …)») y en qué clases existen. */
export function screens(uiSpec: string): { id: string; classes: DeviceClass[] }[] {
  return [...uiSpec.matchAll(/^### (P-\d{2})\. (.*)$/gm)].map((m) => ({
    id: m[1]!,
    classes: /solo ESC|solo escritorio/i.test(m[2]!) ? ['desktop'] : ALL_CLASSES,
  }));
}

/** El prefijo de las referencias visuales de una historia: «Pantallas/Buques y DM» → «pantallas-buques-y-dm». */
export const storySlug = (title: string) => title.toLowerCase().replace(/[/\s]+/g, '-');

export interface TraceInput {
  spec: string;
  constitution: string;
  uiSpec: string;
  /** Pruebas de todo tipo (unitarias, integración, E2E, visuales, Java), con su ruta. */
  tests: { path: string; text: string }[];
  /** Archivos de historias (*.stories.tsx). */
  stories: { path: string; text: string }[];
  /** Nombres de las referencias visuales: «<historia>--<caso>--<clase>--<tema>.png». */
  references: string[];
}

export interface TraceReport {
  /** Requisitos e invariantes que ninguna prueba cita. */
  untested: string[];
  /** Pantallas sin E2E que las cite. */
  noE2e: string[];
  /** Pantallas sin referencias visuales, con las clases que faltan. */
  noVisual: { id: string; missing: DeviceClass[] }[];
  /** Pantallas exentas de E2E y referencias (no son web), con el motivo. */
  exempt: { id: string; reason: string }[];
}

export function trace(input: TraceInput): TraceReport {
  const cited = new Set(input.tests.flatMap((t) => [...citedIds(t.text)]));
  const required = [...specIds(input.spec), ...invariantIds(input.constitution)];
  const e2e = new Set(input.tests.filter((t) => /\.e2e\.ts$/.test(t.path)).flatMap((t) => [...citedIds(t.text)]));
  // Clases con referencia de cada pantalla: las de las historias de los archivos que la citan.
  const visual = new Map<string, Set<DeviceClass>>();
  for (const s of input.stories) {
    const title = /title:\s*'([^']+)'/.exec(s.text)?.[1];
    if (!title) continue;
    const slug = `${storySlug(title)}--`;
    const classes = new Set(
      input.references
        .filter((r) => r.startsWith(slug))
        .map((r) => /--(phone|tablet|desktop)--(?:light|dark)\.png$/.exec(r)?.[1] as DeviceClass | undefined)
        .filter((c): c is DeviceClass => c !== undefined),
    );
    for (const id of citedIds(s.text))
      if (id.startsWith('P-')) visual.set(id, new Set([...(visual.get(id) ?? []), ...classes]));
  }
  const report: TraceReport = { untested: [], noE2e: [], noVisual: [], exempt: [] };
  report.untested = required.filter((id) => !cited.has(id));
  for (const s of screens(input.uiSpec)) {
    if (NOT_WEB[s.id]) {
      report.exempt.push({ id: s.id, reason: NOT_WEB[s.id]! });
      continue;
    }
    if (!e2e.has(s.id)) report.noE2e.push(s.id);
    const have = visual.get(s.id) ?? new Set<DeviceClass>();
    const missing = s.classes.filter((c) => !have.has(c));
    if (missing.length) report.noVisual.push({ id: s.id, missing });
  }
  return report;
}

// ---------- uso: pnpm trace ----------

const SKIP = new Set(['node_modules', 'dist', 'build', '.git', '.engram', 'coverage', 'test-results', 'release']);
const TEST = /\.(test|int\.test|e2e|visual)\.tsx?$|Test\.java$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

if (import.meta.main) {
  const repo = fileURLToPath(new URL('../..', import.meta.url));
  const read = (p: string) => readFileSync(join(repo, p), 'utf8');
  const files = walk(join(repo, 'packages'));
  const load = (re: RegExp) =>
    files.filter((f) => re.test(f)).map((f) => ({ path: relative(repo, f), text: readFileSync(f, 'utf8') }));
  const report = trace({
    spec: read('specs/MVP/spec.md'),
    constitution: read('docs/Constitution.md'),
    uiSpec: read('specs/MVP/ui-spec.md'),
    tests: load(TEST),
    stories: load(/\.stories\.tsx$/),
    references: readdirSync(join(repo, 'packages/web/e2e/visual/references')),
  });
  const lines = [
    ...(report.untested.length
      ? [`Sin prueba que los cite (${report.untested.length}): ${report.untested.join(', ')}`]
      : []),
    ...(report.noE2e.length ? [`Pantallas sin E2E (${report.noE2e.length}): ${report.noE2e.join(', ')}`] : []),
    ...report.noVisual.map((v) => `${v.id} sin referencias visuales en: ${v.missing.join(', ')}`),
  ];
  for (const e of report.exempt) console.log(`${e.id} exenta: ${e.reason}.`);
  if (lines.length) {
    console.error(lines.join('\n'));
    process.exit(1);
  }
  console.log('Trazabilidad completa: cada requisito tiene prueba y cada pantalla su E2E y sus referencias.');
}
