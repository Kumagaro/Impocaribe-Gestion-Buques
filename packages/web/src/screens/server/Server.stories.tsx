import type { Meta, StoryObj } from '@storybook/react-vite';
import { checkServerPc, type SetupProgress } from '@impocaribe/shared';
import type { ServerStatus } from '@impocaribe/shared/validation';
import { asyncNoop, field, inDevice, noop } from '../story-helpers';
import { CreateServerDesktop } from './CreateServer.desktop';
import { ServerStatusDesktop } from './ServerStatus.desktop';
import { CREATE_STEPS, MOVE_STEPS, type CreateServerModel } from './useCreateServer';
import type { ServerStatusModel } from './useServerStatus';

// T127 y T128 · P-28 Crear servidor y P-29 Estado del servidor (ui-spec y maqueta T124): cada estado con un modelo fijo,
// sin servidor ni ayudante. Solo existen en escritorio (Const. art. XIV.1): en las otras clases se ve la misma
// presentación, apilada.
const meta: Meta = { title: 'Pantallas/Servidor' };
export default meta;

const GB = 1024 ** 3;
const MB = 2 ** 20;
const NOW = Date.parse('2026-10-27T19:04:12.000Z');
const TITLES = [
  ['copiar', 'Copiar los componentes del servidor'],
  ['base', 'Crear la base de datos'],
  ['servicio-base', 'Registrar la base de datos como servicio'],
  ['estructura', 'Preparar la estructura de los datos'],
  ['identidad', 'Crear la identidad y el certificado del servidor'],
  ['servicio', 'Registrar el servidor como servicio de Windows'],
  ['firewall', 'Permitir la red local en el firewall'],
  ['energia', 'Ajustar la energía para que la PC no se suspenda'],
  ['montaje', 'Guardar el montaje de red'],
  ['arranque', 'Arrancar y comprobar (servidor, base de datos y PDF)'],
] as const;

/** Los pasos hechos hasta `done`, el siguiente en curso (o fallido) y los demás pendientes. */
function progress(done: number, next: 'running' | 'failed' = 'running'): SetupProgress {
  return {
    steps: TITLES.map(([id, title], i) => {
      const startedAt = NOW - (TITLES.length - i) * 40_000;
      if (i < done) return { id, title, state: 'done' as const, startedAt, endedAt: startedAt + 35_000 };
      if (i === done)
        return next === 'failed'
          ? {
              id,
              title,
              state: 'failed' as const,
              error: 'Windows respondió: acceso denegado.',
              startedAt,
              endedAt: startedAt + 4000,
            }
          : { id, title, state: 'running' as const, startedAt: NOW - 22_000 };
      return { id, title, state: 'pending' as const };
    }),
    log: [
      { at: NOW - 60_000, id: 'estructura', line: 'Estructura de los datos al día.' },
      { at: NOW - 20_000, id: 'identidad', line: 'Servidor IMPOCARIBE-7F3C' },
    ],
    checks: null,
    outcome: next === 'failed' ? { ok: false, step: TITLES[done]![0], error: 'acceso denegado' } : null,
  };
}

const CHECKS = checkServerPc({
  existingServer: null,
  windowsBuild: 22631,
  is64bit: true,
  memoryBytes: 4 * GB,
  freeDiskBytes: 86 * GB,
  network: { kind: 'wifi', name: 'Almacén Impocaribe', address: '192.168.1.10' },
  busyPorts: [],
  hasBattery: true,
});

const create = (extra: Partial<CreateServerModel> = {}): CreateServerModel => ({
  available: true,
  step: 'comprobacion',
  steps: CREATE_STEPS,
  moving: false,
  stepIndex: 0,
  checks: CHECKS,
  searchSeconds: 15,
  canContinue: true,
  recheck: noop,
  toPermissions: noop,
  code: field('code'),
  summary: [],
  checkingCode: false,
  submitCode: asyncNoop,
  network: 'router',
  setNetwork: noop,
  wifiPc: true,
  create: noop,
  moveFile: null,
  moveInfo: null,
  pickMoveFile: asyncNoop,
  movePassword: field('password'),
  moveSummary: [],
  checkingMove: false,
  submitMove: asyncNoop,
  progress: { steps: [], log: [], checks: null, outcome: null },
  running: null,
  elapsedMs: 0,
  failed: null,
  failedTitle: null,
  failedHelp: null,
  retry: noop,
  undo: noop,
  undone: false,
  ready: null,
  firstApoderada: noop,
  notice: null,
  back: noop,
  cancel: noop,
  ...extra,
});

/** P-28 y P-29 son de escritorio: la misma presentación en las tres clases. */
const CREATE = {
  phone: ({ model }: { model: CreateServerModel }) => <CreateServerDesktop m={model} />,
  tablet: ({ model }: { model: CreateServerModel }) => <CreateServerDesktop m={model} />,
  desktop: ({ model }: { model: CreateServerModel }) => <CreateServerDesktop m={model} />,
};

export const CrearComprobacion: StoryObj = {
  name: 'P-28 · 1. Comprobación (4 GB: ámbar)',
  render: inDevice(CREATE, create()),
};
export const CrearYaHayServidor: StoryObj = {
  name: 'P-28 · Ya hay un servidor en la red',
  render: inDevice(
    CREATE,
    create({
      checks: checkServerPc({
        existingServer: { name: 'IMPOCARIBE-7F3C', address: '192.168.1.10' },
        windowsBuild: 22631,
        is64bit: true,
        memoryBytes: 8 * GB,
        freeDiskBytes: 86 * GB,
        network: { kind: 'wifi', name: 'Almacén Impocaribe', address: '192.168.1.11' },
        busyPorts: [],
        hasBattery: true,
      }),
      searchSeconds: 3,
      canContinue: false,
    }),
  ),
};
export const CrearPermisos: StoryObj = {
  name: 'P-28 · 2. Permisos (código de otra empresa)',
  render: inDevice(
    CREATE,
    create({
      step: 'permisos',
      stepIndex: 1,
      code: field('code', 'K7QM-3XTP-R2HX', {
        error: 'El código no es el de esta empresa. Revíselo en la hoja impresa que acompaña al paquete.',
      }),
    }),
  ),
};
export const CrearMontaje: StoryObj = {
  name: 'P-28 · 3. Montaje de red',
  render: inDevice(CREATE, create({ step: 'montaje', stepIndex: 2 })),
};
export const CrearCreacion: StoryObj = {
  name: 'P-28 · 4. Creación',
  render: inDevice(
    CREATE,
    create({ step: 'creacion', stepIndex: 3, progress: progress(4), running: 'crear', elapsedMs: 252_000 }),
  ),
};
export const CrearFallo: StoryObj = {
  name: 'P-28 · Si un paso falla',
  render: inDevice(
    CREATE,
    create({
      step: 'creacion',
      stepIndex: 3,
      progress: progress(6, 'failed'),
      failed: { ok: false, step: 'firewall', error: 'acceso denegado' },
      failedTitle: 'Permitir la red local en el firewall',
      failedHelp:
        'No se pudo permitir la red local en el firewall de Windows. Otro programa de seguridad puede estar bloqueándolo. Permita a «Órdenes de Carga» en ese programa y pulse Reintentar.',
    }),
  ),
};
export const CrearTraslado: StoryObj = {
  name: 'P-28 · Desde un respaldo de traslado',
  render: inDevice(
    CREATE,
    create({
      step: 'archivo',
      stepIndex: 2,
      steps: MOVE_STEPS,
      moving: true,
      moveFile: 'E:\\IMPOCARIBE-7F3C-2026-10-27.icmove',
      moveInfo: { serverName: 'IMPOCARIBE-7F3C', createdAt: '2026-10-27T18:40:00.000Z', devices: 9 },
      movePassword: field('password', 'respaldo de prueba'),
    }),
  ),
};
export const CrearListo: StoryObj = {
  name: 'P-28 · 5. Listo',
  render: inDevice(
    CREATE,
    create({
      step: 'listo',
      stepIndex: 4,
      elapsedMs: 700_000,
      ready: {
        name: 'IMPOCARIBE-7F3C',
        address: '192.168.1.10',
        port: 8443,
        qr: '{"serverId":"7f3c2a10-1b2c-4d5e-8f90-abcdef123456","caFingerprint":"AB:CD","qrToken":"token","address":"192.168.1.10","port":8443}',
      },
    }),
  ),
};

// ---------- P-29 ----------
const STATUS: ServerStatus = {
  serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
  version: '1.4.0',
  startedAt: new Date(NOW - (3 * 24 + 4) * 3600_000).toISOString(),
  power: { onBattery: false, percent: 100, protected: false },
  network: { setup: 'router', address: '192.168.1.10', port: 8443 },
  devices: [
    ['PC SERVIDOR', 'windows', 'local', true],
    ['Oficina · Ilén', 'windows', 'code', true],
    ['Teléfono de báscula', 'android', 'code', true],
    ['Tablet del portón', 'android', 'qr', true],
    ['Teléfono de Yoel', 'android', 'code', false],
  ].map(([name, platform, method, connected], i) => ({
    id: `dev-${i}`,
    name: name as string,
    platform: platform as 'windows' | 'android',
    pairedAt: '2026-10-14T15:00:00.000Z',
    pairedMethod: method as 'local' | 'code' | 'qr',
    lastSeenAt: '2026-10-27T17:00:00.000Z',
    connected: connected as boolean,
  })),
  memory: { budgetBytes: 1.2 * GB, serviceBytes: 184 * MB, databaseBytes: 268 * MB, pdfBytes: null },
};

const status = (extra: Partial<ServerStatusModel> = {}): ServerStatusModel => ({
  status: STATUS,
  error: null,
  name: 'IMPOCARIBE-7F3C',
  now: NOW,
  connected: 4,
  hotspotFull: false,
  pending: [
    {
      id: '0199f0a1-0000-7000-8000-000000000001',
      deviceName: 'Teléfono de patio',
      platform: 'android',
      code: '781975',
      expiresAt: new Date(NOW + 252_000).toISOString(),
    },
  ],
  qr: '{"serverId":"7f3c2a10-1b2c-4d5e-8f90-abcdef123456","caFingerprint":"AB:CD","qrToken":"token","address":"192.168.1.10","port":8443}',
  busy: null,
  notice: null,
  confirm: noop,
  reject: noop,
  canRevoke: true,
  revoke: noop,
  canMaintain: true,
  updateTo: null,
  maintenance: null,
  open: noop,
  close: noop,
  code: field('code'),
  codeSummary: [],
  submitCode: asyncNoop,
  apoderadas: [{ username: 'ilen.fernandez', fullName: 'Ilén Fernández Rojas' }],
  resetFields: {
    username: field('username', 'ilen.fernandez'),
    password: field('password'),
    confirm: field('confirm'),
    code: field('reset-code'),
  },
  resetSummary: [],
  moveFolder: null,
  pickMoveFolder: asyncNoop,
  understood: false,
  setUnderstood: noop,
  moveError: null,
  moveDest: null,
  movePassword: field('move-password'),
  moveCode: field('move-code'),
  moveSummary: [],
  submitMove: asyncNoop,
  wipe: false,
  setWipe: noop,
  uninstallFolder: null,
  uninstallWord: field('word'),
  uninstallCode: field('uninstall-code'),
  uninstallSummary: [],
  submitUninstall: asyncNoop,
  submitReset: asyncNoop,
  progress: { steps: [], log: [], checks: null, outcome: null },
  running: false,
  outcome: null,
  refresh: noop,
  ...extra,
});

const STATUS_VIEW = {
  phone: ({ model }: { model: ServerStatusModel }) => <ServerStatusDesktop m={model} />,
  tablet: ({ model }: { model: ServerStatusModel }) => <ServerStatusDesktop m={model} />,
  desktop: ({ model }: { model: ServerStatusModel }) => <ServerStatusDesktop m={model} />,
};

export const Estado: StoryObj = { name: 'P-29 · Estado del servidor', render: inDevice(STATUS_VIEW, status()) };
export const EstadoBateriaHotspot: StoryObj = {
  name: 'P-29 · Con batería y 8 dispositivos en hotspot',
  render: inDevice(
    STATUS_VIEW,
    status({
      status: {
        ...STATUS,
        power: { onBattery: true, percent: 62, protected: false },
        network: { setup: 'hotspot', address: '192.168.43.20', port: 8443 },
      },
      connected: 8,
      hotspotFull: true,
    }),
  ),
};
export const EstadoProtegido: StoryObj = {
  name: 'P-29 · Modo protegido',
  render: inDevice(
    STATUS_VIEW,
    status({ status: { ...STATUS, power: { onBattery: true, percent: 14, protected: true } }, pending: [] }),
  ),
};
export const EstadoActualizar: StoryObj = {
  name: 'P-29 · Actualizar (vuelta atrás tras un fallo)',
  render: inDevice(
    STATUS_VIEW,
    status({
      updateTo: '1.5.0',
      maintenance: 'actualizar',
      progress: progress(3, 'failed'),
      outcome: { ok: false, step: 'estructura', error: 'migración 0017 falló', rolledBack: true },
    }),
  ),
};
export const EstadoTraslado: StoryObj = {
  name: 'P-29 · Preparar traslado',
  render: inDevice(STATUS_VIEW, status({ maintenance: 'trasladar', moveFolder: 'E:\\' })),
};
export const EstadoDesinstalar: StoryObj = {
  name: 'P-29 · Desinstalar',
  render: inDevice(STATUS_VIEW, status({ maintenance: 'desinstalar' })),
};
export const EstadoRestablecer: StoryObj = {
  name: 'P-29 · Restablecer la contraseña de una Apoderada',
  render: inDevice(STATUS_VIEW, status({ maintenance: 'restablecer' })),
};
