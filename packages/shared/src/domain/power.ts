// T132 · RF-ENE-01 a 05 y plan §10.6: qué hace el servidor según su energía. Con corriente, normal; con batería, avisa
// (AL-20); al 15 % o menos, modo protegido (solo consulta); al 5 % o menos, se detiene de forma ordenada.

export const PROTECTED_AT_PERCENT = 15;
export const STOP_AT_PERCENT = 5;

export type PowerMode = 'mains' | 'battery' | 'protected' | 'stop';

export interface PowerReading {
  onBattery: boolean;
  /** Carga de la batería (o del UPS), si se sabe. */
  percent: number | null;
}

export function powerMode(r: PowerReading): PowerMode {
  if (!r.onBattery) return 'mains';
  if (r.percent === null) return 'battery';
  if (r.percent <= STOP_AT_PERCENT) return 'stop';
  if (r.percent <= PROTECTED_AT_PERCENT) return 'protected';
  return 'battery';
}

/** El aviso de todas las apps (RF-ENE-02, 03); con corriente, ninguno. */
export function powerNotice(r: PowerReading): string | null {
  const mode = powerMode(r);
  if (mode === 'mains') return null;
  if (mode === 'battery')
    return r.percent === null
      ? 'El servidor funciona con batería'
      : `El servidor funciona con batería (${r.percent} %)`;
  return 'Servidor en modo protegido por batería baja: solo consulta';
}
