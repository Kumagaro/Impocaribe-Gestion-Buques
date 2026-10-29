import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PcFacts, SetupMessage, SetupOperation, SetupOutcome, SetupRequest } from '@impocaribe/shared';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../../../test/screen';
import { serverStatusSchema } from '@impocaribe/shared/validation';
import { sampleOf } from '../../../test/fake-server';
import { localApi } from '../../api/endpoints/local';
import { postLocalQr } from '../../api/endpoints/pairing';
import type { ServerSetup } from '../../platform/platform';
import { createSimulatedNetwork } from '../../platform/test-discovery';
import { CreateServerScreen } from './CreateServer.screen';

// T127 · P-28 Crear servidor (ui-spec P-28, F-16): el hook real y la presentación de escritorio, con el ayudante de
// instalación simulado (el real pide el permiso de Windows; se prueba en las máquinas virtuales de T135). La búsqueda de
// otro servidor recorre los métodos de P-01 en la red simulada: unos 10 s por comprobación.
vi.setConfig({ testTimeout: 60_000 });

const GB = 1024 ** 3;
const SERVER_ID = '7f3c2a10-1b2c-4d5e-8f90-abcdef123456';
const FACTS: PcFacts = {
  existingServer: null,
  windowsBuild: 22631,
  is64bit: true,
  memoryBytes: 4 * GB,
  freeDiskBytes: 86 * GB,
  network: { kind: 'wifi', name: 'Almacén Impocaribe', address: '192.168.1.10' },
  busyPorts: [],
  hasBattery: true,
};
const PLAN: SetupMessage = {
  type: 'plan',
  steps: [
    { id: 'copiar', title: 'Copiar los componentes del servidor' },
    { id: 'firewall', title: 'Permitir la red local en el firewall' },
  ],
};
const steps = (...m: [string, 'running' | 'done' | 'failed' | 'undoing' | 'undone', string?][]): SetupMessage[] =>
  m.map(([id, status, error]) => ({ type: 'step', id, status, ...(error ? { error } : {}) }));

/** El ayudante simulado: cada operación contesta con los mensajes y el resultado que se le den. */
function fakeSetup(
  script: Partial<Record<SetupOperation, { messages: SetupMessage[]; outcome: SetupOutcome } | Error>>,
  state: Awaited<ReturnType<ServerSetup['state']>> = { running: false, operation: null, messages: [] },
) {
  let listener: (m: SetupMessage) => void = () => undefined;
  const runs: { operation: SetupOperation; request: SetupRequest }[] = [];
  const setup: ServerSetup = {
    bundleVersion: '1.0.0',
    readMove: async (_file, password) => {
      if (password !== 'respaldo de prueba 2026') throw new Error('La contraseña de respaldo no es correcta.');
      return { serverName: 'IMPOCARIBE-7F3C', createdAt: '2026-10-27T18:40:00.000Z', devices: 9 };
    },
    pickFile: async () => 'E:\\IMPOCARIBE-7F3C-2026-10-27.icmove',
    pickFolder: async () => null,
    facts: async () => FACTS,
    checkCode: async (code) => code === 'K7QM-3XTP-R2HW',
    state: async () => state,
    listen: (l) => (listener = l),
    run: async (operation, request) => {
      runs.push({ operation, request });
      const r = script[operation];
      if (!r) throw new Error(`Sin guion para ${operation}`);
      if (r instanceof Error) throw r;
      for (const m of r.messages) listener(m);
      listener({ type: 'outcome', outcome: r.outcome });
      return r.outcome;
    },
  };
  return { setup, runs };
}

async function open(setup: ServerSetup, network = createSimulatedNetwork(), path = '/servidor/crear') {
  return renderScreen(<CreateServerScreen />, {
    path,
    route: '/servidor/crear',
    pairing: null,
    discovery: network,
    serverSetup: setup,
    otherRoutes: ['/conexion'],
    before: (server) => {
      server.respond(postLocalQr, {
        qrToken: 'token-del-qr',
        serverId: SERVER_ID,
        caFingerprint: 'AB:CD',
        expiresAt: '2026-10-27T19:05:00.000Z',
      });
      server.respond(
        localApi.status,
        sampleOf(serverStatusSchema, {
          serverId: SERVER_ID,
          startedAt: '2026-10-27T19:00:00.000Z',
          network: { setup: 'hotspot', address: '192.168.43.20', port: 8443 },
        }),
      );
    },
  });
}

async function toNetworkStep() {
  const checks = await screen.findByRole('list', { name: 'Comprobación de esta PC' }, { timeout: 30_000 });
  expect(checks.textContent).toContain('Memoria: 4 GB');
  expect(checks.textContent).toContain('Funcionará, aunque más lento; se recomiendan 8 GB.');
  expect(screen.getByText('Una marca ámbar no impide continuar.')).not.toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  // Un código de otra empresa no pasa; sin guiones y en minúsculas, sí.
  await userEvent.type(await screen.findByLabelText('Código de instalación'), 'K7QM3XTPR2HX');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  // El error va en el campo (y en el resumen de errores, con el enlace al campo).
  await waitFor(() => expect(screen.getByLabelText('Código de instalación').getAttribute('aria-invalid')).toBe('true'));
  expect(screen.getAllByText(/El código no es el de esta empresa/).length).toBeGreaterThan(0);
  await userEvent.clear(screen.getByLabelText('Código de instalación'));
  await userEvent.type(screen.getByLabelText('Código de instalación'), 'k7qm3xtpr2hw');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await screen.findByRole('radiogroup', { name: 'Montaje de red' });
}

describe('P-28 Crear servidor', () => {
  it('comprueba la PC, el código y el montaje; crea el servidor y termina con su nombre, el QR y P-02', async () => {
    const network = createSimulatedNetwork();
    const created = {
      messages: [
        PLAN,
        ...steps(['copiar', 'running'], ['copiar', 'done'], ['firewall', 'running'], ['firewall', 'done']),
      ],
      outcome: { ok: true } as const,
    };
    const { setup, runs } = fakeSetup({ crear: created });
    const t = await open(
      {
        ...setup,
        run: async (operation, request) => {
          // Al terminar, el servidor de esta PC responde (lo busca la pantalla para su nombre y el QR).
          network.servers.push({
            address: '127.0.0.1',
            port: 8443,
            serverId: SERVER_ID,
            caFingerprint: 'AB:CD',
            version: '1.0.0',
          });
          return setup.run(operation, request);
        },
      },
      network,
    );
    await toNetworkStep();
    await userEvent.click(screen.getByRole('radio', { name: /Hotspot de un celular/ }));
    expect(screen.getByRole('radio', { name: /Hotspot de un celular/ }).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Crear el servidor' }));

    expect(await screen.findByRole('heading', { name: 'El servidor está listo' }, { timeout: 15_000 })).not.toBeNull();
    // El código va al ayudante (por la tubería), normalizado; el montaje elegido también.
    expect(runs).toEqual([{ operation: 'crear', request: { network: 'hotspot', code: 'K7QM-3XTP-R2HW' } }]);
    expect(screen.getByText('IMPOCARIBE-7F3C', { selector: 'b' })).not.toBeNull();
    expect(screen.getByText(/192\.168\.1\.10 · puerto 8443 · hotspot de un celular/)).not.toBeNull();
    expect(screen.getByRole('img', { name: 'QR para emparejar con IMPOCARIBE-7F3C' })).not.toBeNull();
    expect(screen.getByText(/Deje el celular del hotspot junto a esta PC/)).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Crear la primera Apoderada' }));
    await waitFor(() => expect(t.router.state.location.pathname).toBe('/conexion'));
  });

  it('con otro servidor en la red se detiene en la comprobación: no hay Continuar', async () => {
    const network = createSimulatedNetwork({
      servers: [{ address: '192.168.1.20', port: 8443, serverId: SERVER_ID, caFingerprint: 'AB:CD', version: '1.0.0' }],
    });
    const { setup } = fakeSetup({});
    await open(setup, network);
    const checks = await screen.findByRole('list', { name: 'Comprobación de esta PC' }, { timeout: 30_000 });
    expect(checks.textContent).toContain('Ya hay un servidor en esta red: IMPOCARIBE-7F3C');
    expect(checks.textContent).toContain('Está en 192.168.1.20.');
    expect(within(checks).getAllByLabelText('No cumple')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Volver' })).not.toBeNull();
  });

  it('si un paso falla: lo dice en claro, Reintentar sigue y Deshacer deja la PC como estaba', async () => {
    const failed = {
      messages: [
        PLAN,
        ...steps(
          ['copiar', 'running'],
          ['copiar', 'done'],
          ['firewall', 'running'],
          ['firewall', 'failed', 'acceso denegado'],
        ),
      ],
      outcome: { ok: false, step: 'firewall', error: 'acceso denegado' } as const,
    };
    const undo = {
      messages: [PLAN, ...steps(['copiar', 'undoing'], ['copiar', 'undone'])],
      outcome: { ok: true } as const,
    };
    const { setup, runs } = fakeSetup({ crear: failed, deshacer: undo });
    await open(setup);
    await toNetworkStep();
    await userEvent.click(screen.getByRole('button', { name: 'Crear el servidor' }));

    expect(await screen.findByRole('heading', { name: 'No se pudo terminar' })).not.toBeNull();
    expect(screen.getByText(/Otro programa de seguridad puede estar bloqueándolo/)).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Fallido' })).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(runs.map((r) => r.operation)).toEqual(['crear', 'crear']));
    expect(runs[1]!.request).toEqual({ network: 'router', code: 'K7QM-3XTP-R2HW' });

    await userEvent.click(await screen.findByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByRole('heading', { name: 'La PC quedó como estaba' })).not.toBeNull();
    expect(runs.at(-1)).toEqual({ operation: 'deshacer', request: {} });
  });

  it('si Windows no da el permiso, vuelve al montaje y lo explica', async () => {
    const { setup } = fakeSetup({ crear: new Error('No se concedió el permiso de administrador de Windows.') });
    await open(setup);
    await toNetworkStep();
    await userEvent.click(screen.getByRole('button', { name: 'Crear el servidor' }));
    expect(await screen.findByText('No se concedió el permiso de administrador de Windows.')).not.toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Montaje de red' })).not.toBeNull();
  });

  it('al volver a abrir la app con la creación en curso, sigue en el paso 4', async () => {
    const { setup } = fakeSetup(
      {},
      { running: true, operation: 'crear', messages: [PLAN, ...steps(['copiar', 'running'])] },
    );
    await open(setup);
    expect(await screen.findByRole('heading', { name: 'Creando el servidor' })).not.toBeNull();
    const list = screen.getByRole('list', { name: 'Pasos de la creación' });
    expect(within(list).getByRole('img', { name: 'En curso' })).not.toBeNull();
    expect(within(list).getByRole('img', { name: 'Pendiente' })).not.toBeNull();
    expect(screen.getByText('Paso 1 de 2')).not.toBeNull();
  });
});

// T130 · RF-INS-07: P-28 desde un respaldo de traslado: el archivo y la contraseña en vez del montaje, que se conserva.
describe('P-28 desde un respaldo de traslado', () => {
  it('pide el archivo y su contraseña, comprueba que es del servidor y traslada con la misma identidad', async () => {
    const network = createSimulatedNetwork();
    const created = {
      messages: [PLAN, ...steps(['copiar', 'running'], ['copiar', 'done'])],
      outcome: { ok: true } as const,
    };
    const { setup, runs } = fakeSetup({ crear: created });
    await open(
      {
        ...setup,
        run: async (operation, request) => {
          network.servers.push({
            address: '127.0.0.1',
            port: 8443,
            serverId: SERVER_ID,
            caFingerprint: 'AB:CD',
            version: '1.0.0',
          });
          return setup.run(operation, request);
        },
      },
      network,
      '/servidor/crear?traslado',
    );
    await screen.findByRole('list', { name: 'Comprobación de esta PC' }, { timeout: 30_000 });
    expect(screen.getByText('Trasladar el servidor')).not.toBeNull();
    expect(screen.getByText('Archivo de traslado')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.type(await screen.findByLabelText('Código de instalación'), 'K7QM-3XTP-R2HW');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    // Sin archivo no sigue; con una contraseña que no lo abre, lo dice en el campo.
    await userEvent.type(await screen.findByLabelText('Contraseña de respaldo'), 'otra contraseña');
    await userEvent.click(screen.getByRole('button', { name: 'Trasladar a esta PC' }));
    expect(await screen.findByText('Elija el archivo de traslado (.icmove).')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Elegir el archivo' }));
    expect(screen.getByText('IMPOCARIBE-7F3C-2026-10-27.icmove')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Trasladar a esta PC' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Contraseña de respaldo').getAttribute('aria-invalid')).toBe('true'),
    );
    expect(runs).toEqual([]);

    await userEvent.clear(screen.getByLabelText('Contraseña de respaldo'));
    await userEvent.type(screen.getByLabelText('Contraseña de respaldo'), 'respaldo de prueba 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Trasladar a esta PC' }));
    expect(await screen.findByRole('heading', { name: 'El servidor está listo' }, { timeout: 15_000 })).not.toBeNull();
    expect(runs).toEqual([
      {
        operation: 'crear',
        request: {
          code: 'K7QM-3XTP-R2HW',
          move: { file: 'E:\\IMPOCARIBE-7F3C-2026-10-27.icmove', password: 'respaldo de prueba 2026' },
        },
      },
    ]);
    // El montaje conservado (hotspot), en la guía.
    expect(await screen.findByText(/Deje el celular del hotspot junto a esta PC/)).not.toBeNull();
  });
});
