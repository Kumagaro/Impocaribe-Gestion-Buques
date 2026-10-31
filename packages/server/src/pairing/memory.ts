// T128 · RNF-21 y plan §10.7: cuánta memoria ocupan PostgreSQL y el Chromium de los PDF, para P-29. Se mide fuera del
// proceso (son otros programas) con lo que da Windows; las pruebas ponen una medición simulada (MEMORY_PROBE).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export interface MemoryReading {
  /** Los procesos de PostgreSQL; null si no se pudo medir. */
  databaseBytes: number | null;
  /** Los de chrome-headless-shell; null con Chromium cerrado o sin medida. */
  pdfBytes: number | null;
}

export type MemoryProbe = (pdfOpen: boolean) => Promise<MemoryReading>;

/** Suma la memoria en uso de cada grupo de procesos por su nombre: «postgres=…», una línea por nombre. */
export function parseWorkingSets(stdout: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^([\w-]+)=(\d+)$/.exec(line.trim());
    if (m) out[m[1]!.toLowerCase()] = Number(m[2]);
  }
  return out;
}

export const windowsMemory: MemoryProbe = async (pdfOpen) => {
  if (process.platform !== 'win32') return { databaseBytes: null, pdfBytes: null };
  try {
    const { stdout } = await exec(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-Process postgres, chrome-headless-shell -ErrorAction SilentlyContinue | Group-Object Name | ' +
          'ForEach-Object { "$($_.Name)=$(($_.Group | Measure-Object WorkingSet64 -Sum).Sum)" }',
      ],
      { windowsHide: true, timeout: 15_000 },
    );
    const sets = parseWorkingSets(stdout);
    return {
      databaseBytes: sets.postgres ?? null,
      pdfBytes: pdfOpen ? (sets['chrome-headless-shell'] ?? null) : null,
    };
  } catch {
    return { databaseBytes: null, pdfBytes: null };
  }
};
