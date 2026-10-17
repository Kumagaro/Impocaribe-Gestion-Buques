import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FoundServer } from '../../connection/discovery';
import { asyncNoop, field, inDevice, noop } from '../story-helpers';
import { ConnectionDesktop } from '../connection/Connection.desktop';
import { ConnectionPhone } from '../connection/Connection.phone';
import { ConnectionTablet } from '../connection/Connection.tablet';
import type { ConnectionModel, ConnectionPhase } from '../connection/useConnection';
import { LoginDesktop } from '../login/Login.desktop';
import { LoginPhone } from '../login/Login.phone';
import { LoginTablet } from '../login/Login.tablet';
import type { LoginModel } from '../login/useLogin';
import { RecoverDesktop } from '../recover/Recover.desktop';
import { RecoverPhone } from '../recover/Recover.phone';
import { RecoverTablet } from '../recover/Recover.tablet';
import type { RecoverModel } from '../recover/useRecover';
import { SetupDesktop } from '../setup/Setup.desktop';
import { SetupPhone } from '../setup/Setup.phone';
import { SetupTablet } from '../setup/Setup.tablet';
import type { SetupModel, SetupStep } from '../setup/useSetup';

// T038 · P-01 a P-04 (ui-spec y maquetas T037): cada estado con un modelo fijo, sin servidor. Cambie la clase de
// dispositivo y el tema en la barra superior; las referencias visuales los recorren todos.
const meta: Meta = { title: 'Pantallas/Acceso' };
export default meta;

// ---------- P-01 ----------
const SERVER: FoundServer = {
  address: '192.168.1.10',
  port: 8443,
  serverId: '7f3a2c19-1b2c-4d5e-8f90-abcdef123456',
  caFingerprint: '7F:3A:2C:19:5B:0E:91:AA',
  version: '1.0.0',
  method: 'dnssd',
};
const connection = (phase: ConnectionPhase, extra: Partial<ConnectionModel> = {}): ConnectionModel => ({
  phase,
  notice: null,
  busy: false,
  countdown: '4:38',
  canScan: true,
  advanced: false,
  toggleAdvanced: noop,
  address: field('address'),
  submitAddress: asyncNoop,
  probing: false,
  search: noop,
  pairWithCode: noop,
  cancel: noop,
  scan: noop,
  goLogin: noop,
  ...extra,
});
const CONNECTION = { phone: ConnectionPhone, tablet: ConnectionTablet, desktop: ConnectionDesktop };

export const ConexionBuscando: StoryObj = {
  name: 'P-01 · Buscando',
  render: inDevice(CONNECTION, connection({ kind: 'searching', method: 'broadcast' })),
};
export const ConexionEncontrado: StoryObj = {
  name: 'P-01 · Servidor encontrado',
  render: inDevice(CONNECTION, connection({ kind: 'found', server: SERVER })),
};
export const ConexionCodigo: StoryObj = {
  name: 'P-01 · Código',
  render: inDevice(
    CONNECTION,
    connection({ kind: 'code', server: SERVER, code: '482913', expiresAt: '2026-10-14T16:45:00.000Z' }),
  ),
};
export const ConexionNoEncontrado: StoryObj = {
  name: 'P-01 · No encontrado, dirección escrita',
  render: inDevice(
    CONNECTION,
    connection(
      { kind: 'notFound' },
      {
        advanced: true,
        canScan: false,
        address: field('address', '192.168.1.300', {
          error: 'Escriba una dirección IPv4 o el nombre del equipo, por ejemplo 192.168.1.10 o 192.168.1.10:8443.',
        }),
      },
    ),
  ),
};
export const ConexionListo: StoryObj = {
  name: 'P-01 · Emparejado',
  render: inDevice(CONNECTION, connection({ kind: 'done', name: 'IMPOCARIBE-7F3A' })),
};

// ---------- P-02 ----------
const CODES = ['K7QM-3XTP', 'R2HW-9CND', 'F4ZB-7MRK', 'T8JX-2QPV', 'W3NC-6HDF', 'P9KR-4TZM', 'H6VQ-8BXN', 'M2DT-5WJC'];
const setup = (step: SetupStep, extra: Partial<SetupModel> = {}): SetupModel => ({
  step,
  stepIndex: step === 'password' ? 1 : step === 'codes' ? 2 : 0,
  fullName: field('fullName', 'Ilén Fernández Ruiz', { valid: true }),
  username: field('username', 'ilen.fernandez', { valid: true }),
  nationalId: field('nationalId', '84133105548', {
    warning: 'Revise el carné: no empieza por una fecha de nacimiento válida',
  }),
  phone: field('phone', '5234567', { error: 'El teléfono debe tener 8 dígitos (tiene 7).' }),
  password: field('password', 'contraseña1'),
  confirm: field('confirm', 'contraseña1'),
  summary: [],
  notice: null,
  busy: false,
  next: noop,
  back: noop,
  submit: asyncNoop,
  codes: CODES,
  copied: false,
  setCopied: noop,
  finishing: false,
  finish: noop,
  ...extra,
});
const SETUP = { phone: SetupPhone, tablet: SetupTablet, desktop: SetupDesktop };

export const ArranqueDatos: StoryObj = {
  name: 'P-02 · Datos con validación',
  render: inDevice(SETUP, setup('data')),
};
export const ArranqueContrasena: StoryObj = {
  name: 'P-02 · Contraseña',
  render: inDevice(SETUP, setup('password')),
};
export const ArranqueCodigos: StoryObj = {
  name: 'P-02 · Códigos de recuperación',
  render: inDevice(SETUP, setup('codes')),
};

// ---------- P-03 ----------
const login = (extra: Partial<LoginModel> = {}): LoginModel => ({
  phase: 'ready',
  serverName: 'IMPOCARIBE-7F3A',
  username: field('username', 'ilen.fernandez'),
  password: field('password', 'contraseña'),
  keepSignedIn: false,
  setKeepSignedIn: noop,
  notice: null,
  locked: false,
  busy: false,
  submit: asyncNoop,
  recheck: noop,
  ...extra,
});
const LOGIN = { phone: LoginPhone, tablet: LoginTablet, desktop: LoginDesktop };

export const Login: StoryObj = { name: 'P-03 · Normal', render: inDevice(LOGIN, login()) };
export const LoginAviso: StoryObj = {
  name: 'P-03 · Aviso tras 3 fallos',
  render: inDevice(
    LOGIN,
    login({
      notice: 'Usuario o contraseña incorrectos.',
      password: field('password', '', { warning: 'Le quedan 2 intentos antes del bloqueo de 15 minutos' }),
    }),
  ),
};
export const LoginBloqueado: StoryObj = {
  name: 'P-03 · Bloqueado',
  render: inDevice(
    LOGIN,
    login({
      notice: 'Cuenta bloqueada por 5 intentos fallidos. Podrá intentarlo de nuevo en 12 minutos.',
      locked: true,
    }),
  ),
};
export const LoginSinConfigurar: StoryObj = {
  name: 'P-03 · Sistema sin configurar',
  render: inDevice(LOGIN, login({ phase: 'notConfigured' })),
};

// ---------- P-04 ----------
const recover = (extra: Partial<RecoverModel> = {}): RecoverModel => ({
  done: false,
  locked: false,
  notice: null,
  summary: [],
  username: field('username', 'ilen.fernandez'),
  nationalId: field('nationalId', '84011905548', { valid: true }),
  phone: field('phone', '52345678'),
  code: field('code', 'K7QM-3XTP', { valid: true }),
  password: field('password', 'nueva-clave'),
  confirm: field('confirm', 'nueva-clave'),
  busy: false,
  submit: asyncNoop,
  ...extra,
});
const RECOVER = { phone: RecoverPhone, tablet: RecoverTablet, desktop: RecoverDesktop };

export const Recuperar: StoryObj = {
  name: 'P-04 · Datos que no coinciden',
  render: inDevice(RECOVER, recover({ notice: 'Los datos no coinciden. Revíselos e inténtelo de nuevo.' })),
};
export const RecuperarHecho: StoryObj = {
  name: 'P-04 · Contraseña cambiada',
  render: inDevice(RECOVER, recover({ done: true })),
};
