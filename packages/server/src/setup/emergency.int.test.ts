import { ManualClock } from '@impocaribe/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import { appHeaders } from '../../test/app.ts';
import { useScenario } from '../../test/scenario.ts';
import { hashSecret } from '../auth/password.ts';
import { emergencyReset } from './emergency.ts';

// T126 · RF-INS-11, contra PostgreSQL real: el restablecimiento de emergencia con un código incorrecto se rechaza; con
// el correcto obliga a cambiar la contraseña, revoca las sesiones de esa Apoderada y emite AL-11.
const clock = new ManualClock('2026-08-29T14:00:00.000Z');
const { s, q, get } = useScenario(clock, '2026-08-29T14:00:00.000Z');
const CODE = 'K7QM-3XTP-R2HW';
const reset = (code: string, username = 'ana') =>
  emergencyReset(drizzle(s.suite.app), clock, { code, username, password: 'temporal-2026' });
const audit = () =>
  q("SELECT ok, after->>'code' AS code FROM audit_log WHERE action = 'auth.emergency_reset' ORDER BY at");

beforeEach(async () => {
  await q('UPDATE system_settings SET installation_code_hash = $1', [await hashSecret(CODE)]);
});

describe('restablecimiento de emergencia (RF-INS-11)', () => {
  it('con un código incorrecto se rechaza, queda en la bitácora y no cambia nada', async () => {
    await expect(reset('K7QM-3XTP-R2HX')).rejects.toMatchObject({ code: 'INSTALL_CODE_INVALID' });
    expect(await audit()).toEqual([{ ok: false, code: 'INSTALL_CODE_INVALID' }]);
    expect((await get('/auth/me', 'ana')).status).toBe(200);
    expect(await q("SELECT must_change_password FROM users WHERE username = 'ana'")).toEqual([
      { must_change_password: false },
    ]);
  });

  it('con el correcto: contraseña temporal que deberá cambiar, sesiones cerradas y AL-11', async () => {
    await reset(CODE.toLowerCase());
    expect(await q("SELECT must_change_password FROM users WHERE username = 'ana'")).toEqual([
      { must_change_password: true },
    ]);
    expect((await get('/auth/me', 'ana')).status).toBe(401);
    expect(await q("SELECT title FROM alerts WHERE type = 'AL-11'")).toEqual([
      { title: 'Restablecimiento de emergencia de la contraseña de Ana Apoderada' },
    ]);
    expect(await audit()).toEqual([{ ok: true, code: null }]);
    const login = await s.t.fetch(`${s.t.base}/auth/login`, {
      method: 'POST',
      headers: appHeaders(),
      body: JSON.stringify({
        username: 'ana',
        password: 'temporal-2026',
        deviceId: 'pc-ana',
        deviceLabel: 'ana',
        platform: 'windows',
      }),
    });
    expect(login.status).toBe(200);
  });

  it('solo para una Apoderada activa', async () => {
    await expect(reset(CODE, 'mario')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await get('/auth/me', 'mario')).status).toBe(200);
  });
});
