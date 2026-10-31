import { AppError, ManualClock } from '@impocaribe/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { adminUrl } from '../../test/suite-db.ts';
import { useScenario } from '../../test/scenario.ts';
import { createIdentity, loadIdentity, type SecretProtector } from '../identity/identity.ts';
import { MIGRATED_MESSAGE, readServerState } from '../server-state.ts';
import { prepareMove, readMove, restoreMove } from './move.ts';

// T130 · RF-INS-07, plan §10.5 y D14, contra PostgreSQL real con pg_dump y pg_restore reales: el archivo de traslado
// lleva la base, los archivos y la identidad; la PC anterior queda `migrated` y no arranca; en la nueva, con la
// contraseña de respaldo, vuelve todo con la misma identidad (los dispositivos se reconectan sin emparejarse).
vi.setConfig({ testTimeout: 180_000 });

const START = '2026-10-28T14:00:00.000Z';
const clock = new ManualClock(START);
const { s, call, q } = useScenario(clock, START);
const PASSWORD = 'respaldo de prueba 2026';
const pgBin = process.env.IMPOCARIBE_PG_BIN ?? '';

/** Un protector por «máquina»: la identidad de una no se abre con el de la otra (como DPAPI). */
function machine(): SecretProtector {
  const key = randomBytes(32);
  return {
    async protect(data) {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([c.update(data), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), body]);
    },
    async unprotect(data) {
      const d = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
      d.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([d.update(data.subarray(28)), d.final()]);
    },
  };
}

/** Una base vacía, como la que crea el ayudante en la PC nueva antes de restaurar. */
async function emptyDatabase(): Promise<string> {
  const name = `impocaribe_traslado_${randomBytes(4).toString('hex')}_test`;
  const admin = new pg.Client({ connectionString: adminUrl(s.suite.url) });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  onTestFinished(async () => {
    const c = new pg.Client({ connectionString: adminUrl(s.suite.url) });
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await c.end();
  });
  return adminUrl(s.suite.url, name);
}

async function prepared() {
  await call('ana', 'PUT', '/backups/password', { password: PASSWORD, confirm: PASSWORD });
  const oldPc = machine();
  const identityDir = join(mkdtempSync(join(tmpdir(), 'impocaribe-pc-vieja-')), 'identity');
  const identity = await createIdentity(identityDir, { protector: oldPc, clock });
  await mkdir(join(s.t.dataDir, 'files', 'ab'), { recursive: true });
  writeFileSync(join(s.t.dataDir, 'files', 'ab', 'abcdef'), 'firma oficial');
  const dest = join(mkdtempSync(join(tmpdir(), 'impocaribe-usb-')), 'IMPOCARIBE-7F3C.icmove');
  const deps = { databaseUrl: s.suite.url, pgBin, dataDir: s.t.dataDir, identityDir, protector: oldPc };
  return { identity, dest, deps };
}

describe('preparar el traslado (PC anterior)', () => {
  it('crea el archivo con la base, los archivos y la identidad, y deja este servidor sin poder arrancar', async () => {
    const { dest, deps, identity } = await prepared();
    const meta = await prepareMove({ ...deps, db: drizzle(s.suite.app), clock }, { dest, password: PASSWORD });
    expect(meta).toMatchObject({ kind: 'move', serverName: identity.name, serverId: identity.serverId });
    expect(meta.devices).toBe(
      Number((await q('SELECT count(*)::int AS n FROM devices WHERE revoked_at IS NULL'))[0]!.n),
    );
    // Ni la identidad ni la base van en claro.
    const raw = (await readFile(dest)).toString('latin1');
    expect(raw).not.toContain('PRIVATE KEY');
    expect(raw).not.toContain('firma oficial');
    // D14: la base de la PC anterior queda trasladada y su servidor no arranca.
    expect(await readServerState(s.suite.url)).toBe('migrated');
    expect(MIGRATED_MESSAGE).toContain('no puede volver a arrancar aquí');
    expect(await q("SELECT ok, after->>'serverName' AS name FROM audit_log WHERE action = 'server.move'")).toEqual([
      { ok: true, name: identity.name },
    ]);
    await expect(
      prepareMove({ ...deps, db: drizzle(s.suite.app), clock }, { dest, password: PASSWORD }),
    ).rejects.toThrow('Este servidor ya se trasladó');
  });

  it('con otra contraseña no hace nada', async () => {
    const { dest, deps } = await prepared();
    await expect(
      prepareMove({ ...deps, db: drizzle(s.suite.app), clock }, { dest, password: 'otra contraseña 2026' }),
    ).rejects.toMatchObject({ code: 'BACKUP_PASSWORD_INVALID' });
    expect(await readServerState(s.suite.url)).toBe('active');
  });
});

describe('crear desde el traslado (PC nueva)', () => {
  it('con la contraseña: la misma identidad, la base (activa) y los archivos', async () => {
    const { dest, deps, identity } = await prepared();
    await prepareMove({ ...deps, db: drizzle(s.suite.app), clock }, { dest, password: PASSWORD });
    const devicesBefore = await q('SELECT id, name FROM devices ORDER BY id');

    await expect(readMove(dest, 'otra contraseña 2026')).rejects.toBeInstanceOf(AppError);
    expect(await readMove(dest, PASSWORD)).toMatchObject({ serverName: identity.name });

    const newPc = machine();
    const newData = mkdtempSync(join(tmpdir(), 'impocaribe-pc-nueva-'));
    const newIdentity = join(newData, 'identity');
    const url = await emptyDatabase();
    await restoreMove(
      { databaseUrl: url, pgBin, dataDir: newData, identityDir: newIdentity, protector: newPc },
      { file: dest, password: PASSWORD },
    );
    // La misma identidad, protegida ahora por la máquina nueva: los dispositivos no tienen que emparejarse.
    expect(await loadIdentity(newIdentity, newPc)).toEqual(await loadIdentity(deps.identityDir, deps.protector));
    expect(await readServerState(url)).toBe('active');
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    expect((await c.query('SELECT id, name FROM devices ORDER BY id')).rows).toEqual(devicesBefore);
    await c.end();
    expect(await readFile(join(newData, 'files', 'ab', 'abcdef'), 'utf8')).toBe('firma oficial');
  });

  it('un archivo que no es de traslado se rechaza con un mensaje claro', async () => {
    const other = join(mkdtempSync(join(tmpdir(), 'impocaribe-otro-')), 'fotos.zip');
    writeFileSync(other, 'no es un traslado');
    await expect(readMove(other, PASSWORD)).rejects.toThrow(
      'Ese archivo no es un respaldo de traslado de Órdenes de Carga (.icmove).',
    );
  });
});
