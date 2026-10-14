// Reloj inyectable (plan §11.4): las fechas y plazos que deciden usan la hora del servidor en America/Havana (Const. §6.3).
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Reloj controlado para pruebas: nunca depende de la hora real. */
export class ManualClock implements Clock {
  private ms: number;

  constructor(start: string) {
    this.ms = Date.parse(start);
  }

  now(): Date {
    return new Date(this.ms);
  }

  advance(ms: number): void {
    this.ms += ms;
  }

  set(instant: string): void {
    this.ms = Date.parse(instant);
  }
}

/** Fecha de negocio `YYYY-MM-DD` de un instante, en America/Havana. */
export function havanaDate(instant: Date): string {
  const format = { timeZone: 'America/Havana', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
  return new Intl.DateTimeFormat('en-CA', format).format(instant);
}

const MAX_SKEW_MS = 5 * 60_000;

/** RF-CON-10: la hora del dispositivo difiere de la del servidor en más de 5 minutos. */
export function isClockSkewed(deviceTime: Date, serverTime: Date): boolean {
  return Math.abs(deviceTime.getTime() - serverTime.getTime()) > MAX_SKEW_MS;
}
