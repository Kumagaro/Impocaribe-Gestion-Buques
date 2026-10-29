import { ManualClock } from '@impocaribe/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useScenario } from '../../test/scenario.ts';
import { publishBundled } from './bundled.ts';

// T129 · RF-INS-06 y RF-UPD-01, contra PostgreSQL real: al actualizar el servidor se publican el instalador ligero y el
// APK que trae el instalador completo; lo ya publicado, o más viejo que lo publicado, se salta.
const clock = new ManualClock('2026-10-28T14:00:00.000Z');
const { s, q } = useScenario(clock, '2026-10-28T14:00:00.000Z');

function bundle(version: string) {
  const dir = mkdtempSync(join(tmpdir(), 'impocaribe-publicar-'));
  writeFileSync(join(dir, `impocaribe-${version}.exe`), `MZ instalador ${version}`);
  writeFileSync(join(dir, `impocaribe-${version}.apk`), `PK apk ${version}`);
  writeFileSync(
    join(dir, 'publicar.json'),
    JSON.stringify([
      { platform: 'windows', version, file: `impocaribe-${version}.exe`, signature: 'firma-ed25519' },
      { platform: 'android', version, file: `impocaribe-${version}.apk` },
    ]),
  );
  return dir;
}
const publish = (version: string) => publishBundled(drizzle(s.suite.app), clock, s.t.dataDir, bundle(version));

describe('publicar lo que trae el instalador completo', () => {
  it('publica las dos, sin Apoderada, con su firma y en la bitácora como hecho por el instalador', async () => {
    expect(await publish('1.5.0')).toEqual(['Windows 1.5.0 publicada.', 'Android 1.5.0 publicada.']);
    expect(
      await q(
        "SELECT platform, version, signature, published_by FROM app_releases WHERE version = '1.5.0' ORDER BY platform",
      ),
    ).toEqual([
      { platform: 'windows', version: '1.5.0', signature: 'firma-ed25519', published_by: null },
      { platform: 'android', version: '1.5.0', signature: null, published_by: null },
    ]);
    expect(
      await q(
        "SELECT user_id, after->>'version' AS version, after->>'auto' AS auto FROM audit_log WHERE action = 'release.publish' ORDER BY at, id",
      ),
    ).toEqual([
      { user_id: null, version: '1.5.0', auto: 'true' },
      { user_id: null, version: '1.5.0', auto: 'true' },
    ]);
  });

  it('lo ya publicado o más viejo se salta', async () => {
    await publish('1.5.0');
    expect(await publish('1.5.0')).toEqual([
      'Windows 1.5.0: ya está publicada la 1.5.0.',
      'Android 1.5.0: ya está publicada la 1.5.0.',
    ]);
    expect(await publish('1.4.9')).toEqual([
      'Windows 1.4.9: ya está publicada la 1.5.0.',
      'Android 1.4.9: ya está publicada la 1.5.0.',
    ]);
    expect(await q("SELECT count(*)::int AS n FROM app_releases WHERE platform IN ('windows', 'android')")).toEqual([
      { n: 2 },
    ]);
  });
});
