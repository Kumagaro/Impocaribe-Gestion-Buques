import { ManualClock } from '@impocaribe/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScenario } from '../../test/scenario.ts';
import { evaluateConditions } from '../alerts/conditions.ts';
import { schemaVersion } from '../db/migrate.ts';
import { runBackup } from './backup.ts';
import { decryptFile, openPrivateKey, readMeta, type SealedKey } from './crypto.ts';
import { unpack } from './pack.ts';
import { BackupScheduler } from './scheduler.ts';

// T106 · RF-RES-01, 02, 04, 05, RNF-14, AL-12, contra PostgreSQL real y pg_dump real: el respaldo manual, el programador
// (cada hora en la jornada y diario a la carpeta externa), la retención y las alertas.
vi.setConfig({ testTimeout: 120_000 });

const START = '2026-10-23T14:00:00.000Z'; // viernes, 10:00 en La Habana
const clock = new ManualClock(START);
const { s, post, get, q, call, login, seal, forOrders } = useScenario(clock, START);
const PASSWORD = 'respaldo de prueba 2026';
const define = () => call('ana', 'PUT', '/backups/password', { password: PASSWORD, confirm: PASSWORD });
const scheduler = () => s.t.app.get(BackupScheduler);
const rows = async () =>
  (await q(
    `SELECT kind, status, file_path IS NOT NULL AS file, external_path IS NOT NULL AS ext FROM backups ORDER BY started_at, id`,
  )) as {
    kind: string;
    status: string;
    file: boolean;
    ext: boolean;
  }[];
const al12 = async () => {
  await evaluateConditions(drizzle(s.suite.app), clock);
  return (
    await q(`SELECT dedupe_key AS key FROM alerts WHERE type = 'AL-12' AND status = 'open' ORDER BY dedupe_key`)
  ).map((r) => r.key as string);
};

// La base se limpia en cada prueba (useScenario); la carpeta de respaldos, aquí.
beforeEach(() => rmSync(join(s.t.dataDir, 'backups'), { recursive: true, force: true }));

describe('T106 · respaldos (RF-RES-01, 02, 04, 05)', () => {
  it('sin contraseña no se hace ninguno y AL-12 lo dice (RF-RES-05)', async () => {
    expect((await post('/backups', {}, 'ana')).body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Defina la contraseña de respaldo antes de hacer un respaldo.',
    });
    await scheduler().tick();
    expect(await rows()).toEqual([]);
    expect(await al12()).toEqual(['AL-12:contraseña']);
    expect((await get('/backups')).body.code).toBe('FORBIDDEN');
  });

  it('el manual: base y archivos cifrados con la clave del servidor; solo se abre con la contraseña', async () => {
    await seal();
    await define();
    const res = await post('/backups', {}, 'ana');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'manual', status: 'ok', available: true, createdByName: 'Ana Apoderada' });
    const [row] = await q('SELECT file_path, sha256 FROM backups');
    const file = join(s.t.dataDir, row!.file_path as string);
    expect(readFileSync(file).subarray(0, 7).toString()).toBe('ICBAK1\n');
    expect(await readMeta(file)).toEqual({ kind: 'manual', createdAt: START, format: 1, schema: schemaVersion() });

    const out = mkdtempSync(join(tmpdir(), 'impocaribe-restore-'));
    const [settings] = await q('SELECT backup_private_key FROM system_settings');
    const key = await openPrivateKey(settings!.backup_private_key as SealedKey, PASSWORD);
    await decryptFile(file, join(out, 'pack.bin'), key);
    const names = await unpack(join(out, 'pack.bin'), join(out, 'x'));
    expect(names[0]).toBe('db.dump');
    expect(names.filter((n) => n.startsWith('files/'))).toHaveLength(2); // la firma y el cuño
    expect(
      readFileSync(join(out, 'x', 'db.dump'))
        .subarray(0, 5)
        .toString(),
    ).toBe('PGDMP');
    expect(await q(`SELECT action, ok FROM audit_log WHERE action = 'backup.manual'`)).toEqual([
      { action: 'backup.manual', ok: true },
    ]);
    expect((await get('/backups', 'ana')).body).toHaveLength(1);
  });

  it('el programador: uno por hora en la jornada y el diario, copiado a la carpeta externa; si no está, se reintenta', async () => {
    await define();
    const usb = join(mkdtempSync(join(tmpdir(), 'impocaribe-usb-')), 'Respaldos');
    await q(`UPDATE system_settings SET external_backup_dir = $1`, [usb]);
    await scheduler().tick();
    await scheduler().tick(); // misma hora: nada nuevo
    clock.set('2026-10-23T15:00:00.000Z'); // 11:00
    await scheduler().tick();
    expect(await rows()).toEqual([
      { kind: 'hourly', status: 'ok', file: true, ext: false },
      { kind: 'hourly', status: 'ok', file: true, ext: false },
    ]);
    // 20:00: el diario; la USB no está (la carpeta no existe) y queda pendiente.
    clock.set('2026-10-24T00:00:00.000Z');
    await login();
    await scheduler().tick();
    expect((await rows()).at(-1)).toEqual({ kind: 'daily', status: 'ok', file: true, ext: false });
    expect((await q(`SELECT error FROM backups WHERE kind = 'daily'`))[0]!.error).toMatch(/^No se pudo copiar a /);
    // Se conecta la USB: a los 30 minutos se reintenta y queda copiado.
    mkdirSync(usb, { recursive: true });
    clock.advance(10 * 60_000);
    await scheduler().tick();
    expect(readdirSync(usb)).toEqual([]);
    clock.advance(20 * 60_000);
    await scheduler().tick();
    expect(readdirSync(usb)).toEqual(['2026-10-24T00-00-00-000Z-daily.icbak']);
    expect((await rows()).at(-1)).toEqual({ kind: 'daily', status: 'ok', file: true, ext: true });
  });

  it('retención: los de cada hora duran 48 horas; el registro queda', async () => {
    await define();
    await scheduler().tick();
    clock.set('2026-10-25T14:00:01.000Z'); // 48 h y un segundo después, domingo 10:00
    await login();
    await scheduler().tick();
    expect(await rows()).toEqual([
      { kind: 'hourly', status: 'ok', file: false, ext: false },
      { kind: 'hourly', status: 'ok', file: true, ext: false },
    ]);
    expect(readdirSync(join(s.t.dataDir, 'backups')).filter((f) => f.endsWith('.icbak'))).toHaveLength(1);
  });

  it('si pg_dump falla queda registrado y AL-12 lo dice; a las 10:00 sin ninguno bueno, también «atrasado»', async () => {
    await define();
    const d = { ...scheduler().deps, pgBin: join(tmpdir(), 'no-hay-postgres') };
    const failed = await runBackup(d, 'hourly');
    expect(failed).toMatchObject({ status: 'failed', filePath: null });
    expect(failed!.error).toMatch(/^No se pudo ejecutar pg_dump/);
    // La jornada empezó a las 7:00: más de 2 h sin un respaldo bueno.
    expect(await al12()).toEqual(['AL-12:atrasado', 'AL-12:carpeta', 'AL-12:fallido']);
    clock.set('2026-10-23T15:00:00.000Z'); // 11:00: el de esta hora sale bien
    await login();
    await scheduler().tick();
    expect(await al12()).toEqual(['AL-12:carpeta']);
  });

  it('RNF-14: mientras se respalda se siguen emitiendo órdenes', async () => {
    await define();
    const w = await forOrders();
    const [backup, order] = await Promise.all([runBackup(scheduler().deps, 'manual'), post('/orders', w.order())]);
    expect(backup!.status).toBe('ok');
    expect(order.status).toBe(201);
    expect(existsSync(join(s.t.dataDir, backup!.filePath!))).toBe(true);
  });
});
