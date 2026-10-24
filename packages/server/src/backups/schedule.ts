// T106 · RF-RES-01, plan §10.4: cuándo toca cada respaldo, con la hora de La Habana. Por hora: una vez en cada hora de la
// jornada (de su inicio a su fin, ambos incluidos). Diario: una vez al día, desde la hora configurada. La copia a la carpeta
// externa se reintenta cada 30 minutos mientras falle. AL-12: sin contraseña, el último falló, más de 2 h sin respaldo
// en la jornada o más de 24 h sin copia en la carpeta externa.
import { havanaDate } from '@impocaribe/shared';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const HOURLY_KEEP_MS = 48 * HOUR;
export const DAILY_KEEP = 30;
export const EXTERNAL_RETRY_MS = 30 * MINUTE;
export const STALE_MS = 2 * HOUR;
export const EXTERNAL_STALE_MS = 24 * HOUR;

const HAVANA = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Havana',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Minutos desde la medianoche de La Habana. */
export function havanaMinutes(now: Date): number {
  const [h, m] = HAVANA.format(now).split(':');
  return parseInt(h!, 10) * 60 + parseInt(m!, 10);
}

/** «07:00» o «07:00:00» → minutos. */
export const minutesOf = (time: string) => parseInt(time.slice(0, 2), 10) * 60 + parseInt(time.slice(3, 5), 10);

export const inWorkday = (now: Date, start: string, end: string) => {
  const m = havanaMinutes(now);
  return m >= minutesOf(start) && m <= minutesOf(end);
};

/** El comienzo de la hora en curso (La Habana tiene un desfase de horas enteras con UTC). */
const hourStart = (now: Date) => new Date(Math.floor(now.getTime() / HOUR) * HOUR);

export function hourlyDue(now: Date, workday: { start: string; end: string }, lastStarted: Date | null): boolean {
  return inWorkday(now, workday.start, workday.end) && (lastStarted === null || lastStarted < hourStart(now));
}

export function dailyDue(now: Date, hour: string, lastStarted: Date | null): boolean {
  return havanaMinutes(now) >= minutesOf(hour) && (lastStarted === null || havanaDate(lastStarted) < havanaDate(now));
}

/** Lo que el programador debe hacer ahora. */
export function due(
  now: Date,
  s: { workdayStart: string; workdayEnd: string; dailyBackupHour: string },
  last: { hourly: Date | null; daily: Date | null; externalTried: Date | null; externalPending: boolean },
) {
  return {
    hourly: hourlyDue(now, { start: s.workdayStart, end: s.workdayEnd }, last.hourly),
    daily: dailyDue(now, s.dailyBackupHour, last.daily),
    external:
      last.externalPending &&
      (last.externalTried === null || now.getTime() - last.externalTried.getTime() >= EXTERNAL_RETRY_MS),
  };
}

export interface BackupHealth {
  passwordDefined: boolean;
  lastStatus: 'ok' | 'failed' | 'running' | null;
  lastError: string | null;
  lastOk: Date | null;
  externalDir: string | null;
  lastExternalCopy: Date | null;
  /** Desde cuándo debería haber copia externa (la contraseña definida). */
  since: Date | null;
  workdayStart: string;
  workdayEnd: string;
}

/** Los motivos de AL-12 que se cumplen ahora: [clave, título, detalle]. */
export function backupProblems(h: BackupHealth, now: Date): [string, string, string][] {
  if (!h.passwordDefined)
    return [
      [
        'AL-12:contraseña',
        'Los respaldos automáticos no se hacen',
        'No hay contraseña de respaldo: una Apoderada debe definirla en Respaldos.',
      ],
    ];
  const out: [string, string, string][] = [];
  if (h.lastStatus === 'failed')
    out.push(['AL-12:fallido', 'El último respaldo falló', h.lastError ?? 'No se pudo completar el respaldo.']);
  if (inWorkday(now, h.workdayStart, h.workdayEnd)) {
    // Al empezar la jornada se cuenta desde su inicio, no desde el último respaldo de ayer.
    const startToday = new Date(
      Math.floor(now.getTime() / MINUTE) * MINUTE - (havanaMinutes(now) - minutesOf(h.workdayStart)) * MINUTE,
    );
    const ref = h.lastOk && h.lastOk > startToday ? h.lastOk : startToday;
    if (now.getTime() - ref.getTime() > STALE_MS)
      out.push([
        'AL-12:atrasado',
        'Respaldo atrasado',
        'Hace más de 2 horas que no hay un respaldo durante la jornada.',
      ]);
  }
  if (!h.externalDir)
    out.push([
      'AL-12:carpeta',
      'Sin carpeta externa para los respaldos',
      'Configure la carpeta externa (por ejemplo, la USB) para la copia diaria.',
    ]);
  else {
    const ref = h.lastExternalCopy ?? h.since;
    if (ref && now.getTime() - ref.getTime() > EXTERNAL_STALE_MS)
      out.push([
        'AL-12:externa',
        'Sin copia en la carpeta externa',
        `Hace más de 24 horas que no se copia un respaldo a ${h.externalDir}. Compruebe que la USB está conectada.`,
      ]);
  }
  return out;
}
