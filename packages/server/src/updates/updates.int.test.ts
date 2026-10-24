import { ManualClock } from '@impocaribe/shared';
import { createHash, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { useScenario, type Body } from '../../test/scenario.ts';
import { AppVersions } from './app-versions.ts';

// T113 · RF-UPD-01 a 05, DT-11, contra PostgreSQL real: publicar el instalador ligero y el APK (multipart), marcar la
// versión mínima por plataforma, consultar y descargar sin sesión, y el aviso por WebSocket (AL-15).
vi.setConfig({ testTimeout: 60_000 });

const START = '2026-10-24T14:00:00.000Z';
const clock = new ManualClock(START);
const { s, get, q, token } = useScenario(clock, START);

/** Un «instalador» mínimo con la cabecera de su tipo: MZ (Windows) o PK\x03\x04 (APK). */
const installer = (kind: 'exe' | 'apk', n: number) =>
  Buffer.concat([Buffer.from(kind === 'exe' ? 'MZ\x90\x00' : 'PK\x03\x04', 'latin1'), Buffer.alloc(4096, n)]);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function publish(fields: Record<string, string>, file: Buffer | null, who = 'ana') {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (file) form.append('file', new Blob([new Uint8Array(file)]), 'instalador');
  const res = await s.t.fetch(`${s.t.base}/updates`, {
    method: 'POST',
    headers: { 'X-App-Version': '1.0.0', Authorization: `Bearer ${token(who)}`, 'Idempotency-Key': randomUUID() },
    body: form,
  });
  return { status: res.status, body: (await res.json()) as Body };
}
/** Sin sesión ni dispositivo, como P-27 o una app desactualizada. */
const anonymous = (path: string, headers: Record<string, string> = {}) => fetch(`${s.t.base}${path}`, { headers });
const check = async (platform: string, version: string) =>
  (await (await anonymous(`/updates/check?platform=${platform}&version=${version}`)).json()) as Body;

beforeEach(async () => {
  // La mínima vive en memoria (se relee cada 30 s): cada prueba empieza con la base vacía.
  await s.t.app.get(AppVersions).refresh();
});

describe('T113 · versiones de las apps (RF-UPD-01 a 05)', () => {
  it('se publican el instalador ligero y el APK; la consulta y la descarga no piden sesión', async () => {
    const exe = installer('exe', 1);
    const res = await publish({ platform: 'windows', version: '1.1.0', notes: 'Órdenes más rápidas' }, exe);
    expect(res).toMatchObject({
      status: 201,
      body: {
        platform: 'windows',
        version: '1.1.0',
        sha256: sha(exe),
        sizeBytes: exe.length,
        notes: 'Órdenes más rápidas',
        isMinSupported: false,
        publishedByName: 'Ana Apoderada',
        publishedAt: START,
      },
    });
    await publish({ platform: 'android', version: '1.1.0' }, installer('apk', 2));

    expect(await check('windows', '1.0.0')).toEqual({
      latest: '1.1.0',
      minSupported: '1.0.0',
      mustUpdate: false,
      updateAvailable: true,
      notes: 'Órdenes más rápidas',
      downloadUrl: '/api/v1/updates/windows/1.1.0/download',
      sha256: sha(exe),
    });
    expect(await check('windows', '1.1.0')).toMatchObject({ updateAvailable: false, mustUpdate: false });
    expect(await check('android-webview-chrome', '0.0.0')).toMatchObject({ latest: null, updateAvailable: false });

    const download = await anonymous('/updates/windows/1.1.0/download');
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toBe('attachment; filename="impocaribe-1.1.0.exe"');
    expect(download.headers.get('x-content-sha256')).toBe(sha(exe));
    expect(Buffer.from(await download.arrayBuffer()).equals(exe)).toBe(true);
    expect((await anonymous('/updates/windows/9.9.9/download')).status).toBe(404);

    expect((await get('/updates', 'oscar')).body.map((r: Body) => [r.platform, r.version])).toEqual([
      ['android', '1.1.0'],
      ['windows', '1.1.0'],
    ]);
    expect(
      (
        await q(
          `SELECT action, ok, after->>'version' AS version FROM audit_log WHERE action LIKE 'release.%' ORDER BY id`,
        )
      ).map((r) => [r.action, r.ok, r.version]),
    ).toEqual([
      ['release.publish', true, '1.1.0'],
      ['release.publish', true, '1.1.0'],
    ]);
  });

  it('solo una Apoderada publica, con el archivo de su tipo y una versión nueva', async () => {
    expect((await publish({ platform: 'windows', version: '1.1.0' }, installer('exe', 1), 'mario')).body.code).toBe(
      'FORBIDDEN',
    );
    expect((await publish({ platform: 'windows', version: '1.1' }, installer('exe', 1))).body.details.fields).toEqual({
      version: 'Escriba la versión con tres números separados por puntos, por ejemplo 1.4.2.',
    });
    expect((await publish({ platform: 'windows', version: '1.1.0' }, null)).body.details.fields).toEqual({
      file: 'Elija el archivo del instalador.',
    });
    expect((await publish({ platform: 'android', version: '1.1.0' }, installer('exe', 1))).body.message).toBe(
      'El archivo no es un instalador de Android (.apk).',
    );
    await publish({ platform: 'windows', version: '1.2.0' }, installer('exe', 3));
    expect((await publish({ platform: 'windows', version: '1.2.0' }, installer('exe', 4))).body.message).toBe(
      'La versión 1.2.0 de Windows (instalador ligero) ya está publicada.',
    );
    expect((await publish({ platform: 'windows', version: '1.1.9' }, installer('exe', 5))).body.message).toBe(
      'Ya está publicada la 1.2.0 de Windows (instalador ligero): publique una versión más nueva.',
    );
    expect(await q(`SELECT version FROM app_releases`)).toEqual([{ version: '1.2.0' }]);
  });

  it('la mínima de una plataforma: por debajo, 426 en esa plataforma y solo en ella; el aviso llega por WebSocket', async () => {
    const socket = new WebSocket(`${s.t.base.replace('http', 'ws')}/ws`);
    const messages: Body[] = [];
    socket.on('message', (d) => messages.push(JSON.parse(d.toString()) as Body));
    await new Promise((r) => socket.once('open', r));
    socket.send(JSON.stringify({ type: 'auth', token: token('oscar') }));
    await vi.waitFor(() => expect(messages).toContainEqual({ type: 'ready' }));

    const win = (await publish({ platform: 'windows', version: '1.3.0' }, installer('exe', 6))).body;
    await vi.waitFor(() =>
      expect(messages).toContainEqual({ type: 'app.update', platform: 'windows', version: '1.3.0', mandatory: false }),
    );
    const marked = await s.t.fetch(`${s.t.base}/updates/${win.id}/min-supported`, {
      method: 'POST',
      headers: { 'X-App-Version': '1.0.0', Authorization: `Bearer ${token('ana')}`, 'Idempotency-Key': randomUUID() },
    });
    expect(marked.status).toBe(200);
    expect(((await marked.json()) as Body).isMinSupported).toBe(true);
    await vi.waitFor(() =>
      expect(messages).toContainEqual({ type: 'app.update', platform: 'windows', version: '1.3.0', mandatory: true }),
    );
    socket.terminate();

    expect(await check('windows', '1.2.9')).toMatchObject({ minSupported: '1.3.0', mustUpdate: true });
    expect(await check('android', '1.2.9')).toMatchObject({ minSupported: '1.0.0', mustUpdate: false });

    // Cualquier ruta de la API salvo estado, descubrimiento y versiones, que quedan abiertas (DT-11).
    const as = (platform: string, version: string) =>
      s.t.fetch(`${s.t.base}/auth/me`, {
        headers: { 'X-App-Version': version, 'X-App-Platform': platform, Authorization: `Bearer ${token('oscar')}` },
      });
    const old = await as('windows', '1.2.9');
    expect(old.status).toBe(426);
    expect(await old.json()).toEqual({
      code: 'UPGRADE_REQUIRED',
      message: 'Esta versión de la app (1.2.9) ya no es compatible. Actualícela a la 1.3.0 o superior.',
      details: { appVersion: '1.2.9', minVersion: '1.3.0' },
    });
    expect((await as('windows', '1.3.0')).status).toBe(200);
    expect((await as('android', '1.2.9')).status).toBe(200);
    // La consulta y la descarga siguen abiertas a la app desactualizada.
    expect(
      (await anonymous('/updates/check?platform=windows&version=1.2.9', { 'X-App-Platform': 'windows' })).status,
    ).toBe(200);

    // Una mínima nueva reemplaza a la anterior.
    const next = (await publish({ platform: 'windows', version: '1.4.0' }, installer('exe', 7))).body;
    await s.t.fetch(`${s.t.base}/updates/${next.id}/min-supported`, {
      method: 'POST',
      headers: { 'X-App-Version': '1.0.0', Authorization: `Bearer ${token('ana')}`, 'Idempotency-Key': randomUUID() },
    });
    expect(await q(`SELECT version FROM app_releases WHERE is_min_supported`)).toEqual([{ version: '1.4.0' }]);
    expect(
      (await q(`SELECT before, after FROM audit_log WHERE action = 'release.min_supported' ORDER BY id`)).map((r) => [
        r.before,
        r.after,
      ]),
    ).toEqual([
      [
        { platform: 'windows', minSupported: null },
        { platform: 'windows', minSupported: '1.3.0' },
      ],
      [
        { platform: 'windows', minSupported: '1.3.0' },
        { platform: 'windows', minSupported: '1.4.0' },
      ],
    ]);
  });

  it('los instaladores del WebView se publican, pero no tienen versión mínima', async () => {
    const wv = (await publish({ platform: 'android-webview-system', version: '119.0.0' }, installer('apk', 8))).body;
    const res = await s.t.fetch(`${s.t.base}/updates/${wv.id}/min-supported`, {
      method: 'POST',
      headers: { 'X-App-Version': '1.0.0', Authorization: `Bearer ${token('ana')}`, 'Idempotency-Key': randomUUID() },
    });
    expect(((await res.json()) as Body).message).toBe('Solo las apps de Windows y Android tienen versión mínima.');
    const download = await anonymous('/updates/android-webview-system/119.0.0/download');
    expect(download.headers.get('content-disposition')).toBe(
      'attachment; filename="android-webview-system-119.0.0.apk"',
    );
  });
});
