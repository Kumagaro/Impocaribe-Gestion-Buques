// T132 · RF-ENE-01 y plan §10.6: de dónde saca el servidor si la PC funciona con corriente o con batería (la de una
// laptop, o un UPS conectado por USB, que Windows presenta como batería). Inyectable: las pruebas usan uno simulado.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PowerReading } from '@impocaribe/shared';

export interface PowerProvider {
  read(): Promise<PowerReading>;
}

const run = promisify(execFile);
const MAINS: PowerReading = { onBattery: false, percent: null };
/** Win32_Battery.BatteryStatus: 1 se descarga, 4 baja y 5 crítica (también descargándose); el resto, con corriente. */
const DISCHARGING = new Set([1, 4, 5]);

/** En Windows, la batería por CIM (sin PowerShell de por medio en otros sistemas: siempre con corriente). */
export const windowsPower: PowerProvider = {
  async read() {
    if (process.platform !== 'win32') return MAINS;
    const { stdout } = await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Battery | Select-Object -First 1 BatteryStatus,EstimatedChargeRemaining | ConvertTo-Json',
      ],
      { timeout: 15_000, windowsHide: true },
    );
    if (!stdout.trim()) return MAINS; // sin batería: PC de escritorio sin UPS
    const b = JSON.parse(stdout) as { BatteryStatus: number | null; EstimatedChargeRemaining: number | null };
    return {
      onBattery: DISCHARGING.has(b.BatteryStatus ?? 2),
      percent: b.EstimatedChargeRemaining ?? null,
    };
  },
};

/** Para las pruebas: la lectura que se le ponga. */
export function simulatedPower(initial: PowerReading = MAINS): PowerProvider & { set(r: PowerReading): void } {
  let current = initial;
  return {
    read: async () => current,
    set: (r) => {
      current = r;
    },
  };
}
