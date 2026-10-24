import { describe, expect, it } from 'vitest';
import { backupProblems, dailyDue, due, havanaMinutes, hourlyDue, type BackupHealth } from './schedule.ts';

// T106 · RF-RES-01, AL-12. En octubre de 2026 La Habana está en UTC−4: las 10:00 de allí son las 14:00 UTC.
const at = (iso: string) => new Date(iso);
const WORKDAY = { start: '07:00:00', end: '19:00:00' };

describe('cuándo toca el respaldo por hora', () => {
  it.each([
    ['06:59 de La Habana: fuera de la jornada', '2026-10-23T10:59:00.000Z', null, false],
    ['07:00: el primero de la jornada', '2026-10-23T11:00:00.000Z', null, true],
    ['10:20, con el de las 10:00 hecho', '2026-10-23T14:20:00.000Z', '2026-10-23T14:00:30.000Z', false],
    ['11:00, con el último a las 10:00', '2026-10-23T15:00:00.000Z', '2026-10-23T14:00:30.000Z', true],
    ['19:00: el último de la jornada', '2026-10-23T23:00:00.000Z', '2026-10-23T22:00:00.000Z', true],
    ['19:01: ya no', '2026-10-23T23:01:00.000Z', '2026-10-23T22:00:00.000Z', false],
  ])('%s', (_name, now, last, expected) => {
    expect(hourlyDue(at(now), WORKDAY, last ? at(last) : null)).toBe(expected);
  });
});

describe('cuándo toca el diario', () => {
  it.each([
    ['antes de la hora', '2026-10-23T23:59:00.000Z', null, false],
    ['a las 20:00 de La Habana', '2026-10-24T00:00:00.000Z', null, true],
    ['ya hecho hoy', '2026-10-24T01:00:00.000Z', '2026-10-24T00:00:10.000Z', false],
    ['hecho ayer', '2026-10-25T00:30:00.000Z', '2026-10-24T00:00:10.000Z', true],
  ])('%s', (_name, now, last, expected) => {
    expect(dailyDue(at(now), '20:00', last ? at(last) : null)).toBe(expected);
  });

  it('la copia externa pendiente se reintenta cada 30 minutos', () => {
    const s = { workdayStart: '07:00', workdayEnd: '19:00', dailyBackupHour: '20:00' };
    const last = { hourly: null, daily: null, externalPending: true };
    const now = at('2026-10-23T03:00:00.000Z');
    expect(due(now, s, { ...last, externalTried: at('2026-10-23T02:40:00.000Z') }).external).toBe(false);
    expect(due(now, s, { ...last, externalTried: at('2026-10-23T02:30:00.000Z') }).external).toBe(true);
    expect(due(now, s, { ...last, externalPending: false, externalTried: null }).external).toBe(false);
  });

  it('minutos de La Habana', () => {
    expect(havanaMinutes(at('2026-10-23T14:05:00.000Z'))).toBe(10 * 60 + 5);
    expect(havanaMinutes(at('2026-12-23T14:05:00.000Z'))).toBe(9 * 60 + 5); // UTC−5 en invierno
  });
});

describe('AL-12', () => {
  const health = (extra: Partial<BackupHealth> = {}): BackupHealth => ({
    passwordDefined: true,
    lastStatus: 'ok',
    lastError: null,
    lastOk: at('2026-10-23T14:00:00.000Z'),
    externalDir: 'E:/Respaldos',
    lastExternalCopy: at('2026-10-23T00:00:00.000Z'),
    since: at('2026-10-01T00:00:00.000Z'),
    workdayStart: '07:00',
    workdayEnd: '19:00',
    ...extra,
  });
  const keys = (h: BackupHealth, now: string) => backupProblems(h, at(now)).map(([k]) => k);

  it('todo al día: nada', () => {
    expect(keys(health(), '2026-10-23T15:00:00.000Z')).toEqual([]);
  });
  it('sin contraseña: solo eso', () => {
    expect(keys(health({ passwordDefined: false, externalDir: null }), '2026-10-23T15:00:00.000Z')).toEqual([
      'AL-12:contraseña',
    ]);
  });
  it('el último falló', () => {
    expect(
      backupProblems(
        health({ lastStatus: 'failed', lastError: 'pg_dump: sin espacio' }),
        at('2026-10-23T15:00:00.000Z'),
      ),
    ).toEqual([['AL-12:fallido', 'El último respaldo falló', 'pg_dump: sin espacio']]);
  });
  it('más de 2 h sin respaldo en la jornada; al empezarla se cuenta desde su inicio', () => {
    expect(keys(health(), '2026-10-23T16:00:01.000Z')).toEqual(['AL-12:atrasado']);
    expect(keys(health(), '2026-10-23T23:59:00.000Z')).toEqual([]); // 19:59: fuera de la jornada
    const yesterday = health({ lastOk: at('2026-10-22T23:00:00.000Z') });
    expect(keys(yesterday, '2026-10-23T12:30:00.000Z')).toEqual([]); // 08:30
    expect(keys(yesterday, '2026-10-23T13:00:01.000Z')).toEqual(['AL-12:atrasado']); // 09:00
  });
  it('sin carpeta externa, o más de 24 h sin copia en ella', () => {
    expect(keys(health({ externalDir: null }), '2026-10-23T15:00:00.000Z')).toEqual(['AL-12:carpeta']);
    expect(keys(health(), '2026-10-24T00:00:01.000Z')).toEqual(['AL-12:externa']);
    expect(
      keys(health({ lastExternalCopy: null, since: at('2026-10-23T14:00:00.000Z') }), '2026-10-23T15:00:00.000Z'),
    ).toEqual([]);
  });
});
