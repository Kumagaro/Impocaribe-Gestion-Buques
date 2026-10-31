import { ManualClock } from '@impocaribe/shared';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { appHeaders } from '../../test/app.ts';
import { useScenario } from '../../test/scenario.ts';
import { encryptFile } from './crypto.ts';
import { drizzle } from 'drizzle-orm/node-postgres';
import { evaluateConditions } from '../alerts/conditions.ts';
import { Maintenance } from './maintenance.ts';
import { restoreBackup } from './restore.ts';
import { BackupScheduler } from './scheduler.ts';

// T107 · RF-RES-03, 06, D12, contra PostgreSQL real con pg_dump y pg_restore reales: restaurar no reutiliza números, las
// órdenes emitidas después del respaldo quedan como perdidas y lo que no debe volver atrás se conserva.
vi.setConfig({ testTimeout: 180_000 });

const START = '2026-10-23T14:00:00.000Z';
const clock = new ManualClock(START);
const { s, post, get, q, call, login, forOrders } = useScenario(clock, START);
const PASSWORD = 'respaldo de prueba 2026';
/** El mismo camión el mismo día: con la excepción y su motivo (D5). */
const SAME_DAY = { sameDay: 'Segundo viaje del día autorizado por la terminal' };
const define = () => call('ana', 'PUT', '/backups/password', { password: PASSWORD, confirm: PASSWORD });
const restore = (backupId: string, extra: object = {}) =>
  post('/restores', { backupId, password: PASSWORD, confirm: 'RESTAURAR', ...extra }, 'ana');

describe('T107 · restauración (RF-RES-03, 06, D12)', () => {
  it('vuelve al respaldo; las órdenes posteriores quedan perdidas y la numeración no retrocede', async () => {
    await define();
    const w = await forOrders();
    const first = (await post('/orders', w.order())).body;
    const backup = (await post('/backups', {}, 'ana')).body;
    const second = (await post('/orders', w.order({ tons: '10', overrides: SAME_DAY }))).body;
    const third = (await post('/orders', w.order({ tons: '5', overrides: SAME_DAY }))).body;
    expect([first.number, second.number, third.number]).toEqual([
      'EAGLE1-2026-V1-0001',
      'EAGLE1-2026-V1-0002',
      'EAGLE1-2026-V1-0003',
    ]);
    // Un dispositivo emparejado después del respaldo.
    await s.t.fetch(`${s.t.base}/health`, { headers: { ...appHeaders(), 'X-Device-Id': 'tel-nuevo' } });
    const [{ epoch: oldEpoch }] = await q('SELECT epoch FROM sync_state');

    const res = await restore(backup.id);
    expect(res).toMatchObject({ status: 200, body: { lostOrders: 2, confirmationRequired: false } });

    expect(await q('SELECT number FROM load_orders ORDER BY seq')).toEqual([{ number: first.number }]);
    expect(await q('SELECT last_order_seq FROM vessels')).toEqual([{ last_order_seq: 3 }]);
    expect(await q(`SELECT number, status FROM lost_orders ORDER BY seq`)).toEqual([
      { number: second.number, status: 'pending' },
      { number: third.number, status: 'pending' },
    ]);
    const [lost] = await q(`SELECT payload FROM lost_orders WHERE number = $1`, [second.number]);
    expect(Object.keys(lost!.payload as object).sort()).toEqual([
      'files',
      'order',
      'signatures',
      'stamps',
      'trailers',
      'versions',
    ]);
    // Lo que no vuelve atrás: el historial de respaldos (con el previo), los dispositivos y la época.
    expect((await q('SELECT kind FROM backups ORDER BY started_at, kind')).map((r) => r.kind)).toEqual([
      'manual',
      'pre_restore',
    ]);
    expect(await q(`SELECT id FROM devices WHERE id = 'tel-nuevo'`)).toEqual([{ id: 'tel-nuevo' }]);
    const [{ epoch }] = await q('SELECT epoch FROM sync_state');
    expect(epoch).not.toBe(oldEpoch);
    expect(await q('SELECT count(*)::int AS n FROM sessions WHERE revoked_at IS NULL')).toEqual([{ n: 0 }]);
    expect(await q(`SELECT action, ok FROM audit_log WHERE action = 'backup.restore'`)).toEqual([
      { action: 'backup.restore', ok: true },
    ]);
    expect((await get('/orders')).status).toBe(401);

    // La siguiente orden sigue desde el mayor número emitido antes de restaurar.
    await login();
    const next = (await post('/orders', w.order({ tons: '3', overrides: SAME_DAY }))).body;
    expect(next.number).toBe('EAGLE1-2026-V1-0004');
  });

  it('con otra contraseña o sin «RESTAURAR» no cambia nada', async () => {
    await define();
    const backup = (await post('/backups', {}, 'ana')).body;
    expect((await restore(backup.id, { password: 'no es la contraseña' })).body.code).toBe('BACKUP_PASSWORD_INVALID');
    expect((await restore(backup.id, { confirm: 'restaurar' })).body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { fields: { confirm: 'Escriba exactamente RESTAURAR, en mayúsculas.' } },
    });
    expect((await post('/restores', { backupId: backup.id, password: PASSWORD, confirm: 'RESTAURAR' })).body.code).toBe(
      'FORBIDDEN',
    );
    expect(await q('SELECT count(*)::int AS n FROM restores')).toEqual([{ n: 0 }]);
    expect(await q('SELECT count(*)::int AS n FROM sessions WHERE revoked_at IS NULL')).toEqual([{ n: 3 }]);
  });

  it('un respaldo de otra versión del esquema no se restaura', async () => {
    await define();
    const [settings] = await q('SELECT backup_public_key FROM system_settings');
    const dir = mkdtempSync(join(tmpdir(), 'impocaribe-old-'));
    writeFileSync(join(dir, 'x'), 'viejo');
    await encryptFile(join(dir, 'x'), join(s.t.dataDir, 'viejo.icbak'), settings!.backup_public_key as string, {
      kind: 'manual',
      createdAt: START,
      format: 1,
      schema: 3,
    });
    const [row] = await q(
      `INSERT INTO backups (kind, status, started_at, file_path) VALUES ('manual', 'ok', now(), 'viejo.icbak') RETURNING id`,
    );
    expect((await restore(row!.id as string)).body.message).toMatch(
      /^Este respaldo es de otra versión del servidor \(esquema 3;/,
    );
  });

  it('AL-19 sigue abierta mientras haya órdenes perdidas pendientes', async () => {
    await define();
    const w = await forOrders();
    await post('/orders', w.order());
    const backup = (await post('/backups', {}, 'ana')).body;
    await post('/orders', w.order({ tons: '10', overrides: SAME_DAY }));
    await restore(backup.id);
    await evaluateConditions(drizzle(s.suite.app), clock);
    expect(await q(`SELECT title, status FROM alerts WHERE type = 'AL-19'`)).toEqual([
      { title: 'Órdenes perdidas por recuperar', status: 'open' },
    ]);
  });

  it('T108: sin poder respaldar el estado anterior, no se emite hasta confirmar el último número impreso', async () => {
    await define();
    const w = await forOrders();
    await post('/orders', w.order());
    const backup = (await post('/backups', {}, 'ana')).body;
    // Una base que no se puede respaldar antes de restaurar (dañada).
    const deps = {
      ...s.t.app.get(BackupScheduler).deps,
      maintenance: s.t.app.get(Maintenance),
      preRestore: async () => null,
    };
    const [{ id: anaId }] = await q(`SELECT id FROM users WHERE username = 'ana'`);
    const result = await restoreBackup(
      deps,
      { backupId: backup.id, password: PASSWORD },
      {
        userId: anaId as string,
        sessionId: anaId as string,
        deviceId: 'pc-ana',
      },
    );
    expect(result).toMatchObject({ lostOrders: 0, confirmationRequired: true });

    await login();
    expect((await post('/orders', w.order({ tons: '1', overrides: SAME_DAY }))).body.code).toBe(
      'NUMBERING_CONFIRMATION_REQUIRED',
    );
    expect((await get('/restores/numbering', 'ana')).body).toEqual({
      required: true,
      vessels: [{ id: w.vessel.id, name: 'Eagle 1', code: 'EAGLE1', lastOrderSeq: 1 }],
    });
    expect((await post('/restores/numbering', { vessels: [] }, 'ana')).body.details.fields).toEqual({
      [`vessels.${w.vessel.id}`]: 'Falta el último número impreso de Eagle 1.',
    });
    expect(
      (await post('/restores/numbering', { vessels: [{ vesselId: w.vessel.id, lastPrinted: 0 }] }, 'ana')).body.details
        .fields,
    ).toEqual({ 'vessels.0.lastPrinted': 'Debe ser al menos 1, el último número restaurado de Eagle 1.' });
    // En la realidad se imprimieron hasta la 7 (las posteriores al respaldo se perdieron con la base).
    expect(
      (await post('/restores/numbering', { vessels: [{ vesselId: w.vessel.id, lastPrinted: 7 }] }, 'ana')).status,
    ).toBe(200);
    expect((await post('/orders', w.order({ tons: '1', overrides: SAME_DAY }))).body.number).toBe(
      'EAGLE1-2026-V1-0008',
    );
  });

  it('mientras se restaura, el servidor responde 503 salvo el estado', async () => {
    const maintenance = s.t.app.get(Maintenance);
    maintenance.active = true;
    onTestFinished(() => {
      maintenance.active = false;
    });
    expect((await get('/orders')).body).toMatchObject({ code: 'RESTORE_IN_PROGRESS' });
    expect((await s.t.fetch(`${s.t.base}/health`, { headers: appHeaders() })).status).toBe(200);
    // Las tareas en segundo plano no corren.
    await s.t.app.get(BackupScheduler).tick();
    expect(await q('SELECT count(*)::int AS n FROM backups')).toEqual([{ n: 0 }]);
  });
});
