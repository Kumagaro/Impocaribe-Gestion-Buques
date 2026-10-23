import { ManualClock } from '@impocaribe/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useScenario } from '../../test/scenario.ts';
import { evaluateConditions } from '../alerts/conditions.ts';
import { decryptFile, encryptFile, openPrivateKey, type SealedKey } from './crypto.ts';

// T105 · RF-RES-04, 08, DT-07, AL-23, contra PostgreSQL real: definir, cambiar, confirmar y aplazar la contraseña de
// respaldo; nunca queda en la bitácora.
const START = '2026-10-23T14:00:00.000Z';
const clock = new ManualClock(START);
const { s, call, post, get, q, login } = useScenario(clock, START);
const PASSWORD = 'respaldo de prueba 2026';
const NEW = 'contraseña nueva de 2027';
const DAY = 86_400_000;
const put = async (body: unknown, who = 'ana') => {
  const res = await call(who, 'PUT', '/backups/password', body);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const define = () => put({ password: PASSWORD, confirm: PASSWORD });
const settings = async () => (await q('SELECT * FROM system_settings'))[0]!;

describe('T105 · contraseña de respaldo (RF-RES-04, 08)', () => {
  it('solo la Apoderada; definirla crea el par de claves y cuenta como confirmada; nunca va a la bitácora', async () => {
    expect((await get('/backups/password')).body.code).toBe('FORBIDDEN');
    expect((await get('/backups/password', 'ana')).body).toEqual({
      defined: false,
      setAt: null,
      confirmedAt: null,
      due: false,
      postponesLeft: 3,
    });
    expect((await define()).body).toEqual({
      defined: true,
      setAt: START,
      confirmedAt: START,
      due: false,
      postponesLeft: 3,
    });
    const row = await settings();
    expect(row.backup_public_key).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(Object.keys(row.backup_private_key as object).sort()).toEqual(['data', 'nonce', 'salt', 'tag', 'v']);
    const log = JSON.stringify(await q('SELECT * FROM audit_log'));
    expect(log).toContain('backup.password');
    expect(log).not.toContain(PASSWORD);
    expect(JSON.stringify(await q('SELECT * FROM idempotency_keys'))).not.toContain(PASSWORD);
  });

  it('cambiarla exige la actual y los respaldos anteriores se abren con la nueva', async () => {
    await define();
    const dir = mkdtempSync(join(tmpdir(), 'impocaribe-bk-'));
    writeFileSync(join(dir, 'dump'), 'respaldo de antes del cambio');
    await encryptFile(join(dir, 'dump'), join(dir, 'antes.icbak'), (await settings()).backup_public_key as string, {});

    expect((await put({ password: NEW, confirm: NEW })).body).toMatchObject({
      code: 'BACKUP_PASSWORD_INVALID',
      details: { fields: { current: 'Escriba la contraseña de respaldo actual.' } },
    });
    expect((await put({ current: 'no es la actual de nada', password: NEW, confirm: NEW })).body).toMatchObject({
      code: 'BACKUP_PASSWORD_INVALID',
      details: { fields: { current: 'La contraseña de respaldo actual no es correcta.' } },
    });
    expect((await put({ current: PASSWORD, password: NEW, confirm: NEW })).status).toBe(200);

    const sealed = (await settings()).backup_private_key as SealedKey;
    await expect(openPrivateKey(sealed, PASSWORD)).rejects.toMatchObject({ code: 'BACKUP_PASSWORD_INVALID' });
    await decryptFile(join(dir, 'antes.icbak'), join(dir, 'out'), await openPrivateKey(sealed, NEW));
    expect(readFileSync(join(dir, 'out'), 'utf8')).toBe('respaldo de antes del cambio');
  });

  it('a los 90 días toca confirmarla: se aplaza hasta 3 veces un día cada vez; una mal escrita queda rechazada', async () => {
    await define();
    clock.set(new Date(Date.parse(START) + 90 * DAY).toISOString());
    await login();
    expect((await get('/backups/password', 'ana')).body).toMatchObject({ due: true, postponesLeft: 3 });

    for (const left of [2, 1, 0]) {
      expect((await post('/backups/password/postpone', {}, 'ana')).body).toMatchObject({
        due: false,
        postponesLeft: left,
      });
      clock.advance(DAY);
      await login();
      expect((await get('/backups/password', 'ana')).body.due).toBe(true);
    }
    expect((await post('/backups/password/postpone', {}, 'ana')).body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Ya se aplazó 3 veces: escriba la contraseña de respaldo para confirmarla.',
    });

    expect((await post('/backups/password/confirm', { password: 'equivocada' }, 'ana')).body).toMatchObject({
      code: 'BACKUP_PASSWORD_INVALID',
    });
    expect(await q(`SELECT ok FROM audit_log WHERE action = 'backup.password.confirm' ORDER BY id`)).toEqual([
      { ok: false },
    ]);
    const ok = (await post('/backups/password/confirm', { password: PASSWORD }, 'ana')).body;
    expect(ok).toMatchObject({ due: false, postponesLeft: 3, confirmedAt: clock.now().toISOString() });
  });

  it('AL-23: se abre a los 90 días sin confirmar y se resuelve al confirmarla', async () => {
    await define();
    const evaluate = () => evaluateConditions(drizzle(s.suite.app), clock);
    await evaluate();
    expect(await q(`SELECT status FROM alerts WHERE type = 'AL-23'`)).toEqual([]);
    clock.set(new Date(Date.parse(START) + 90 * DAY).toISOString());
    await login();
    await evaluate();
    expect(await q(`SELECT status, title FROM alerts WHERE type = 'AL-23'`)).toEqual([
      { status: 'open', title: 'Contraseña de respaldo sin confirmar' },
    ]);
    await post('/backups/password/confirm', { password: PASSWORD }, 'ana');
    await evaluate();
    expect(await q(`SELECT status FROM alerts WHERE type = 'AL-23'`)).toEqual([{ status: 'resolved' }]);
  });
});
