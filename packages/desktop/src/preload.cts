// T115 · plan §10.1: el único puente entre la interfaz y el proceso principal (aislamiento de contexto y sandbox). Deja
// pasar solo los canales de NATIVE_CHANNELS; la interfaz no ve ipcRenderer ni nada de Node. CommonJS: el preload con
// sandbox no carga módulos ES ni otros archivos, así que la lista se repite aquí (una prueba la compara con la de shared).
import type {
  NativeBridge,
  NativeChannel,
  NativeDeviceInfo,
  NativeSocketEvent,
  SetupMessage,
} from '@impocaribe/shared';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- el preload con sandbox es CommonJS y solo puede cargar electron
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const PRELOAD_CHANNELS: readonly NativeChannel[] = [
  'http',
  'ws.open',
  'ws.send',
  'ws.close',
  'discovery.browse',
  'discovery.broadcast',
  'discovery.probe',
  'discovery.subnet',
  'secure.get',
  'secure.set',
  'secure.remove',
  'db.open',
  'db.execute',
  'db.query',
  'file.save',
  'notify',
  'secureScreen',
  'update.install',
  'qr.scan',
  'alerts.start',
  'alerts.stop',
  'setup.facts',
  'setup.code',
  'setup.run',
  'setup.state',
  'window.attention',
  'setup.move',
  'setup.pickFile',
  'setup.pickFolder',
];
const allowed = new Set<string>(PRELOAD_CHANNELS);

const bridge: NativeBridge = {
  info: ipcRenderer.sendSync('native:info') as NativeDeviceInfo,
  invoke: (channel, ...args) => {
    if (!allowed.has(channel)) return Promise.reject(new Error(`Canal no permitido: ${channel}`));
    return ipcRenderer.invoke(`native:${channel}`, ...args);
  },
  onSocket: (listener) => {
    ipcRenderer.on('native:socket', (_e, id: number, event: NativeSocketEvent, data?: string) =>
      listener(id, event, data),
    );
  },
  onUpdateProgress: (listener) => {
    ipcRenderer.removeAllListeners('native:update-progress');
    ipcRenderer.on('native:update-progress', (_e, received: number, total: number) => listener(received, total));
  },
  onSetupMessage: (listener) => {
    ipcRenderer.removeAllListeners('native:setup-message');
    ipcRenderer.on('native:setup-message', (_e, message: SetupMessage) => listener(message));
  },
};

contextBridge.exposeInMainWorld('impocaribeNative', bridge);
