import { lineReader, type SetupMessage, type SetupRequest } from '@impocaribe/shared';
import { connect } from 'node:net';
import { describe, expect, it } from 'vitest';
import { NO_PERMISSION, SetupHelper, type Launcher } from './setup.ts';

// T127 · DT-17: la conversación de la app con el ayudante elevado por la tubería con nombre. El lanzador de la prueba
// no pide permiso: hace de ayudante (se conecta, lee la petición y contesta como lo haría impocaribe-setup.exe).
const PLAN: SetupMessage = { type: 'plan', steps: [{ id: 'copiar', title: 'Copiar los componentes del servidor' }] };

/** Un ayudante falso que contesta `reply` a la petición que lee de la tubería. */
function fakeHelper(reply: SetupMessage[], seen: { args?: string[]; request?: SetupRequest } = {}): Launcher {
  return (_exe, args) =>
    new Promise((resolve) => {
      seen.args = args;
      const socket = connect(args[args.indexOf('--tuberia') + 1]!);
      socket.on(
        'data',
        lineReader<SetupRequest>((request) => {
          seen.request = request;
          for (const m of reply) socket.write(`${JSON.stringify(m)}\n`);
          socket.end(() => resolve(0));
        }),
      );
    });
}

describe('ayudante de instalación desde la app', () => {
  it('manda la petición por la tubería (no en la línea de comandos) y entrega el progreso y el resultado', async () => {
    const got: SetupMessage[] = [];
    const seen: { args?: string[]; request?: SetupRequest } = {};
    const reply: SetupMessage[] = [
      PLAN,
      { type: 'step', id: 'copiar', status: 'running' },
      { type: 'step', id: 'copiar', status: 'done' },
      { type: 'outcome', outcome: { ok: true } },
    ];
    const helper = new SetupHelper('impocaribe-setup.exe', (m) => got.push(m), fakeHelper(reply, seen));
    const outcome = await helper.run('crear', { network: 'hotspot', code: 'K7QM-3XTP-R2HW' });
    expect(outcome).toEqual({ ok: true });
    expect(seen.request).toEqual({ network: 'hotspot', code: 'K7QM-3XTP-R2HW' });
    expect(seen.args![0]).toBe('crear');
    expect(seen.args!.join(' ')).not.toContain('K7QM');
    expect(seen.args![2]).toMatch(/^\\\\\.\\pipe\\impocaribe-setup-[0-9a-f-]{36}$/);
    expect(got).toEqual(reply);
    // Si la ventana se recarga, P-28 recupera lo que pasó.
    expect(helper.current()).toEqual({ running: false, operation: 'crear', messages: reply });
  });

  it('si Windows no da el permiso (nadie se conecta a la tubería), lo dice', async () => {
    const helper = new SetupHelper(
      'impocaribe-setup.exe',
      () => undefined,
      async () => 1,
    );
    await expect(helper.run('crear', { code: 'K7QM-3XTP-R2HW' })).rejects.toThrow(NO_PERMISSION);
    expect(helper.current().running).toBe(false);
  });

  it('un ayudante que termina sin resultado cuenta como fallo', async () => {
    const helper = new SetupHelper('impocaribe-setup.exe', () => undefined, fakeHelper([PLAN]));
    expect(await helper.run('reparar', { code: 'K7QM-3XTP-R2HW' })).toEqual({
      ok: false,
      step: 'inicio',
      error: 'El ayudante terminó sin resultado (código 0).',
    });
  });

  it('solo atiende al primero que se conecta: otro no recibe la petición', async () => {
    let intruder = '';
    const launch: Launcher = (_exe, args) =>
      new Promise((resolve) => {
        const pipe = args[args.indexOf('--tuberia') + 1]!;
        const socket = connect(pipe);
        socket.on(
          'data',
          lineReader(() => {
            // Con el ayudante ya conectado, otro proceso intenta conectarse a la misma tubería.
            const other = connect(pipe);
            other.on('data', (chunk) => (intruder += chunk.toString()));
            let ended = false;
            const end = () => {
              if (ended) return;
              ended = true;
              socket.end(`${JSON.stringify({ type: 'outcome', outcome: { ok: true } })}\n`, () => resolve(0));
            };
            other.on('error', end);
            other.on('close', end);
          }),
        );
      });
    const helper = new SetupHelper('impocaribe-setup.exe', () => undefined, launch);
    expect(await helper.run('crear', { code: 'K7QM-3XTP-R2HW' })).toEqual({ ok: true });
    expect(intruder).toBe('');
  });

  it('no lanza dos a la vez', async () => {
    let finish: () => void = () => undefined;
    const slow: Launcher = (exe, args) =>
      new Promise((resolve) => {
        finish = () => void fakeHelper([{ type: 'outcome', outcome: { ok: true } }])(exe, args).then(resolve);
      });
    const helper = new SetupHelper('impocaribe-setup.exe', () => undefined, slow);
    const first = helper.run('crear', { code: 'K7QM-3XTP-R2HW' });
    await expect(helper.run('deshacer', {})).rejects.toThrow('ya está trabajando');
    await new Promise((r) => setTimeout(r, 50));
    finish();
    expect(await first).toEqual({ ok: true });
  });
});
