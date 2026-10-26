// T118 · plan §10.2: el puente nativo de la app Android. El plugin ImpocaribeNative (Java) atiende los mismos canales
// que el proceso principal de Electron (NATIVE_CHANNELS); aquí se adapta a `NativeBridge`. El puente de Capacitor solo
// lleva JSON: los bytes (cuerpos, archivos, columnas BLOB) viajan como `{ $bytes: base64 }` en los dos sentidos. Se usa
// el objeto global que inyecta Capacitor, así la interfaz no depende de @capacitor/core.
import type { NativeBridge, NativeChannel, NativeDeviceInfo, NativeSocketEvent } from '@impocaribe/shared';

interface PluginListener {
  remove(): Promise<void>;
}
/** Lo que expone el plugin Java por el puente de Capacitor. */
export interface ImpocaribeNativePlugin {
  info(): Promise<NativeDeviceInfo>;
  invoke(options: { channel: NativeChannel; args: unknown[] }): Promise<{ value?: unknown }>;
  addListener(
    event: 'socket',
    fn: (e: { id: number; event: NativeSocketEvent; data?: string }) => void,
  ): Promise<PluginListener>;
  addListener(event: 'updateProgress', fn: (e: { received: number; total: number }) => void): Promise<PluginListener>;
}
interface CapacitorGlobal {
  isNativePlatform(): boolean;
  Plugins: { ImpocaribeNative?: ImpocaribeNativePlugin };
}

const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Uint8Array → { $bytes } en todo el árbol de argumentos. */
export function encodeBytes(value: unknown): unknown {
  if (value instanceof Uint8Array) return { $bytes: toBase64(value) };
  if (Array.isArray(value)) return value.map(encodeBytes);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeBytes(v)]));
  return value;
}

/** { $bytes } → Uint8Array en todo el árbol de la respuesta. */
export function decodeBytes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeBytes);
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.$bytes === 'string' && Object.keys(o).length === 1) return fromBase64(o.$bytes);
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, decodeBytes(v)]));
  }
  return value;
}

/** El plugin, si la app corre dentro de la app Android. */
export function capacitorPlugin(): ImpocaribeNativePlugin | null {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform() ? (cap.Plugins.ImpocaribeNative ?? null) : null;
}

/** Arma el `NativeBridge` sobre el plugin (la información del dispositivo se lee una vez, antes de arrancar). */
export async function capacitorBridge(plugin: ImpocaribeNativePlugin): Promise<NativeBridge> {
  const info = await plugin.info();
  return {
    info,
    invoke: async (channel, ...args) =>
      decodeBytes((await plugin.invoke({ channel, args: encodeBytes(args) as unknown[] })).value),
    onSocket: (listener) => void plugin.addListener('socket', (e) => listener(e.id, e.event, e.data)),
    onUpdateProgress: (listener) => void plugin.addListener('updateProgress', (e) => listener(e.received, e.total)),
  };
}
