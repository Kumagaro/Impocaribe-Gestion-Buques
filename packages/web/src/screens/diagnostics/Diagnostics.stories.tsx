import type { Meta, StoryObj } from '@storybook/react-vite';
import { inDevice, noop } from '../story-helpers';
import { DiagnosticsDesktop } from './Diagnostics.desktop';
import { DiagnosticsPhone } from './Diagnostics.phone';
import { DiagnosticsTablet } from './Diagnostics.tablet';
import { STEPS, type DiagnosticsModel } from './useDiagnostics';

// T048 · P-30 Diagnóstico de red (ui-spec y maqueta T037): cada veredicto con un modelo fijo, sin red.
const meta: Meta = { title: 'Pantallas/Diagnóstico de red' };
export default meta;

const details = (over: Record<string, string>) =>
  Object.entries({
    'Red wifi': 'IMPOCARIBE-WIFI',
    Método: 'Última dirección conocida',
    Dirección: '192.168.1.10:8443',
    'Tiempo de respuesta': '12 ms',
    Identidad: 'IMPOCARIBE-7F3A · Verificada',
    'Última sincronización': 'hace 4 segundos',
    ...over,
  }).map(([label, value]) => ({ label, value }));

const model = (over: Partial<DiagnosticsModel>): DiagnosticsModel => ({
  verdict: 'ok',
  tone: 'ok',
  title: 'Todo bien',
  message: 'El servidor responde y su identidad está verificada.',
  steps: [],
  details: details({}),
  running: false,
  retry: noop,
  ...over,
});

const SIN_RESPUESTA = {
  Método: '—',
  'Tiempo de respuesta': 'Sin respuesta',
  Identidad: 'IMPOCARIBE-7F3A · Sin verificar',
};
const VIEWS = { phone: DiagnosticsPhone, tablet: DiagnosticsTablet, desktop: DiagnosticsDesktop };

export const TodoBien: StoryObj = { name: 'Todo bien', render: inDevice(VIEWS, model({})) };
export const Comprobando: StoryObj = {
  name: 'Comprobando',
  render: inDevice(
    VIEWS,
    model({
      verdict: 'checking',
      tone: 'info',
      title: 'Comprobando la conexión…',
      message: 'Buscando el servidor por todos los métodos.',
      details: details({ Método: '—', 'Tiempo de respuesta': '—' }),
      running: true,
    }),
  ),
};
export const ServidorNoResponde: StoryObj = {
  name: 'El servidor no responde',
  render: inDevice(
    VIEWS,
    model({
      verdict: 'down',
      tone: 'bad',
      title: 'El servidor no responde',
      message: 'Última respuesta hace 6 minutos.',
      steps: STEPS.down,
      details: details({ ...SIN_RESPUESTA, 'Última sincronización': 'hace 6 minutos' }),
    }),
  ),
};
export const RedAisla: StoryObj = {
  name: 'La red aísla a los equipos',
  render: inDevice(
    VIEWS,
    model({
      verdict: 'isolated',
      tone: 'warn',
      title: 'La red bloquea la comunicación entre equipos',
      message: 'Este dispositivo llega al router, pero no a los demás equipos de la red.',
      steps: STEPS.isolated,
      details: details(SIN_RESPUESTA),
    }),
  ),
};
export const SinRed: StoryObj = {
  name: 'Sin red',
  render: inDevice(
    VIEWS,
    model({
      verdict: 'no-network',
      tone: 'bad',
      title: 'Este dispositivo no está conectado a ninguna red',
      message: 'Sin red no se puede llegar al servidor.',
      steps: STEPS['no-network'],
      details: details({ ...SIN_RESPUESTA, 'Red wifi': 'Sin red' }),
    }),
  ),
};
