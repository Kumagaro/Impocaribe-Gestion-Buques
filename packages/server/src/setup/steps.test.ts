import { describe, expect, it } from 'vitest';
import { runSteps, undoSteps, type Journal, type JournalData } from './engine.ts';
import { layout, SERVICES } from './layout.ts';
import { acDc, createSteps, type Sys } from './steps.ts';

// T126 · plan §10.3: los pasos de «Crear servidor» sobre una PC simulada que reproduce el efecto de cada comando. Un
// fallo inyectado en cada paso y Deshacer deja la PC como estaba; lo que ya existía (otra instalación) se conserva.
const l = layout({ ProgramFiles: 'C:\\Program Files', ProgramData: 'C:\\ProgramData' });
const BUNDLE = 'E:\\instalador\\server-bundle';

function fakePc(options: { existingInstall?: boolean; fail?: (file: string, args: string[]) => boolean } = {}) {
  const files = new Map<string, string>([[`${BUNDLE}\\node\\node.exe`, 'node']]);
  const services = new Set<string>();
  const running = new Set<string>();
  const rules = new Set<string>();
  const power: Record<string, [number, number]> = { STANDBYIDLE: [1800, 900], HIBERNATEIDLE: [0, 3600] };
  const under = (dir: string) => [...files.keys()].filter((k) => k === dir || k.startsWith(`${dir}\\`));
  if (options.existingInstall) {
    files.set(`${l.data}\\pgdata\\PG_VERSION`, '16');
    files.set(`${l.data}\\servicio\\secretos.json`, JSON.stringify({ postgres: 'p', app: 'a' }));
    files.set(`${l.data}\\identity\\identity.json`, '{"name":"IMPOCARIBE-7F3C"}');
    services.add(SERVICES.database);
  }
  const fail = (file: string, args: string[]) => {
    if (options.fail?.(file, args)) throw new Error(`falló ${file.split('\\').pop()} ${args[0] ?? ''}`);
  };
  const sys: Sys = {
    async run(file, args, opts) {
      fail(file, args);
      const name = file.split('\\').pop()!;
      if (name === 'initdb.exe') {
        files.set(`${args[1]}\\PG_VERSION`, '16');
        files.set(`${args[1]}\\postgresql.conf`, '# por defecto');
      } else if (name === 'pg_ctl.exe' && args[0] === 'register') services.add(SERVICES.database);
      else if (name === 'pg_ctl.exe' && args[0] === 'unregister') services.delete(SERVICES.database);
      else if (name === 'psql.exe') return args.at(-1)!.startsWith('SELECT 1 FROM pg_database') ? '' : '';
      else if (name === 'node.exe' && args[1] === 'identity') {
        const id = `${l.data}\\identity\\identity.json`;
        const created = !files.has(id);
        files.set(id, '{"name":"IMPOCARIBE-7F3C"}');
        files.set(`${l.data}\\identity\\ca.crt`, 'CA');
        return JSON.stringify({ created, name: 'IMPOCARIBE-7F3C' });
      } else if (name === 'node.exe') return `ok ${args[1]} ${opts?.input ?? ''}`;
      else if (name === `${SERVICES.server}.exe` && args[0] === 'install') services.add(SERVICES.server);
      else if (name === `${SERVICES.server}.exe` && args[0] === 'uninstall') services.delete(SERVICES.server);
      else if (name === 'netsh' && args[2] === 'add') rules.add(args[4]!.slice('name='.length));
      else if (name === 'netsh' && args[2] === 'delete') rules.delete(args[4]!.slice('name='.length));
      else if (name === 'powercfg' && args[0] === '/query') {
        const [ac, dc] = power[args[3]!]!;
        const hex = (n: number) => `0x${n.toString(16).padStart(8, '0')}`;
        return `GUID: 29f6c1db-86da-48c5\n  Índice actual de CA: ${hex(ac)}\n  Índice actual de CC: ${hex(dc)}\n`;
      } else if (name === 'powercfg' && args[0] !== '/setactive') {
        const side = args[0] === '/setacvalueindex' ? 0 : 1;
        power[args[3]!]![side] = Number(args[4]);
      }
      return '';
    },
    async succeeds(file, args) {
      const name = file.split('\\').pop()!;
      if (name === 'sc.exe' && args[0] === 'query') return services.has(args[1]!);
      if (name === 'sc.exe' && args[0] === 'start') return services.has(args[1]!) && Boolean(running.add(args[1]!));
      if (name === 'sc.exe' && args[0] === 'stop') return running.delete(args[1]!);
      if (name === 'pg_isready.exe') return running.has(SERVICES.database);
      if (name === 'netsh') return rules.has(args[4]!.slice('name='.length));
      return true;
    },
    async exists(path) {
      return under(path).length > 0;
    },
    async copy(from, to) {
      fail('copy', [from]);
      if (files.has(from)) files.set(to, files.get(from)!);
      for (const k of under(from)) files.set(to + k.slice(from.length), files.get(k)!);
    },
    async remove(path) {
      for (const k of under(path)) files.delete(k);
    },
    async readFile(path) {
      const text = files.get(path);
      if (text === undefined) throw new Error(`No existe ${path}`);
      return text;
    },
    async writeFile(path, text) {
      files.set(path, text);
    },
    async lockDown() {},
    async ok() {
      return running.has(SERVICES.server);
    },
    secret: () => 'secreto',
    sleep: async () => undefined,
  };
  const snapshot = () => ({
    files: [...files.keys()].sort(),
    services: [...services].sort(),
    rules: [...rules].sort(),
    power: JSON.parse(JSON.stringify(power)) as typeof power,
  });
  let saved: JournalData | null = null;
  const journal: Journal = {
    load: async () => (saved ? (JSON.parse(JSON.stringify(saved)) as JournalData) : null),
    save: async (d) => {
      saved = JSON.parse(JSON.stringify(d)) as JournalData;
    },
  };
  return { sys, snapshot, journal, files, services, rules, power };
}

const input = { bundle: BUNDLE, network: 'hotspot' as const, codeHash: '$argon2id$v=19$m=65536,t=3,p=1$c2Fs$aGFzaA' };
const IDS = [
  'copiar',
  'base',
  'servicio-base',
  'estructura',
  'identidad',
  'servicio',
  'firewall',
  'energia',
  'montaje',
  'arranque',
];

describe('crear el servidor', () => {
  it('en una PC limpia hace los diez pasos: programa, base, servicios, reglas, energía y arranque', async () => {
    const pc = fakePc();
    const steps = createSteps(pc.sys, l, input);
    expect(steps.map((s) => s.id)).toEqual(IDS);
    expect(await runSteps('create', steps, pc.journal, () => undefined)).toEqual({ ok: true });
    expect(pc.services).toEqual(new Set([SERVICES.database, SERVICES.server]));
    expect(pc.rules.size).toBe(3);
    expect(pc.power).toEqual({ STANDBYIDLE: [0, 0], HIBERNATEIDLE: [0, 0] });
    expect(pc.files.has(`${l.program}\\node\\node.exe`)).toBe(true);
    expect(pc.files.get(`${l.data}\\pgdata\\postgresql.conf`)).toContain("include 'impocaribe.conf'");
  });

  it.each(IDS)('con un fallo en «%s», Deshacer deja la PC como estaba', async (failing) => {
    const failsAt: Record<string, (file: string, args: string[]) => boolean> = {
      copiar: (f) => f === 'copy',
      base: (f) => f.endsWith('initdb.exe'),
      'servicio-base': (f, a) => f.endsWith('pg_ctl.exe') && a[0] === 'register',
      estructura: (f) => f.endsWith('psql.exe'),
      identidad: (f, a) => f.endsWith('node.exe') && a[1] === 'identity',
      servicio: (f, a) => f.endsWith(`${SERVICES.server}.exe`) && a[0] === 'install',
      firewall: (f, a) => f === 'netsh' && a[2] === 'add' && a[4] === 'name=Órdenes de Carga · anuncio mDNS',
      energia: (f, a) => f === 'powercfg' && a[3] === 'HIBERNATEIDLE' && a[0] === '/setdcvalueindex',
      montaje: (f, a) => f.endsWith('node.exe') && a[1] === 'settings',
      arranque: () => false,
    };
    const pc = fakePc({ fail: failsAt[failing]! });
    const before = pc.snapshot();
    const steps = createSteps(pc.sys, l, input);
    if (failing === 'arranque') pc.sys.ok = async () => false; // el servidor no responde
    const outcome = await runSteps('create', steps, pc.journal, () => undefined);
    expect(outcome).toMatchObject({ ok: false, step: failing });
    expect(await undoSteps('create', steps, pc.journal, () => undefined)).toEqual({ ok: true });
    // Un paso que falla a medias limpia lo suyo (la energía, por ejemplo, ya había cambiado un valor).
    expect(pc.snapshot()).toEqual(before);
  });

  it('lo que ya existía (otra instalación) se conserva al deshacer', async () => {
    const pc = fakePc({ existingInstall: true, fail: (f) => f === 'netsh' });
    const steps = createSteps(pc.sys, l, input);
    await runSteps('create', steps, pc.journal, () => undefined);
    await undoSteps('create', steps, pc.journal, () => undefined);
    expect(pc.files.has(`${l.data}\\pgdata\\PG_VERSION`)).toBe(true);
    expect(pc.files.has(`${l.data}\\identity\\identity.json`)).toBe(true);
    expect(pc.services.has(SERVICES.database)).toBe(true);
  });
});

describe('energía (powercfg)', () => {
  it('lee los valores con corriente y con batería por los números, sea cual sea el idioma de Windows', () => {
    const es =
      'GUID de configuración: 29f6c1db-86da\n  Índice de configuración de CA actual: 0x00000708\n  Índice de configuración de CC actual: 0x00000384\n';
    expect(acDc(es)).toEqual([1800, 900]);
    expect(() => acDc('sin números')).toThrow('No se pudo leer la configuración de energía actual.');
  });
});
