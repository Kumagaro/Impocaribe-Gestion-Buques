// T038 · Plataforma del navegador de desarrollo y de las pruebas de extremo a extremo (plan §11.2: "en el navegador con
// un transporte de prueba"). Las apps registran siempre la suya, nativa (Electron, T115; Android, T118): esta solo se
// usa cuando no hay ninguna. No verifica la identidad del servidor (lo hace el transporte nativo, DT-19) y guarda los
// secretos en sessionStorage, que muere con la pestaña: sirve para probar, nunca para trabajar.
import { SERVER_PORT } from '../connection/discovery';
import type { DeviceInfo, Platform, PlatformDiscovery, ServerAnnouncement, PlatformSocket } from './platform';
import { openSqlJsDatabase } from './sqljs';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

async function probe(address: string, port: number, timeoutMs: number): Promise<ServerAnnouncement | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${address}:${port}/api/v1/discovery`, { signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { serverId: string; caFingerprint: string; version: string };
    return { address, port, serverId: body.serverId, caFingerprint: body.caFingerprint, version: body.version };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost']);

/**
 * El servidor es el propio origen de la página (vite lo redirige a /api): se "anuncia" como si estuviera en la red. Si la
 * página se abre en este mismo equipo, su servidor es también "el de este equipo" (127.0.0.1:8443, PC servidor, P-01).
 */
export function browserDiscovery(origin: { address: string; port: number }): PlatformDiscovery {
  const announce = async (timeoutMs: number) => {
    const found = await probe(origin.address, origin.port, timeoutMs);
    return found ? [found] : [];
  };
  const local = LOOPBACK.has(origin.address);
  return {
    browse: announce,
    broadcast: announce,
    probe: (address, port, timeoutMs) =>
      local && LOOPBACK.has(address) && port === SERVER_PORT
        ? probe(origin.address, origin.port, timeoutMs)
        : probe(address, port, timeoutMs),
    subnetAddresses: async () => [],
  };
}

/** platform.ws con el WebSocket del navegador (por el proxy de vite, en el mismo origen). */
export function browserSocket(url: string): PlatformSocket {
  const ws = new WebSocket(url);
  return {
    send: (data) => ws.send(data),
    close: () => ws.close(),
    on(event, listener) {
      if (event === 'message') ws.addEventListener('message', (e) => listener(String(e.data)));
      else if (event === 'close') ws.addEventListener('close', (e) => listener(String(e.code)));
      else ws.addEventListener(event, () => listener());
    },
  };
}

export function createBrowserPlatform(
  location: { hostname: string; port: string; search: string },
  appVersion: string,
): Platform {
  // ?device=phone o tablet se comporta como Android (se empareja por código); escritorio, como Windows.
  const android = /[?&]device=(phone|tablet)\b/.test(location.search);
  const info: DeviceInfo = {
    platform: android ? 'android' : 'windows',
    appVersion,
    smallestWidthDp: android ? 360 : 1024,
  };
  const storage = window.sessionStorage;
  return {
    serverScheme: 'http',
    http: (url, init) => fetch(url, init),
    ws: browserSocket,
    discovery: browserDiscovery({ address: location.hostname, port: Number(location.port || 80) }),
    deviceInfo: () => info,
    secureStorage: {
      get: async (key) => storage.getItem(`impocaribe-prueba:${key}`),
      set: async (key, value) => storage.setItem(`impocaribe-prueba:${key}`, value),
      remove: async (key) => storage.removeItem(`impocaribe-prueba:${key}`),
    },
    // La copia local del navegador vive en memoria y muere con la pestaña: sirve para probar, nunca para trabajar.
    openDatabase: () => openSqlJsDatabase(() => sqlWasmUrl),
    saveFile: async () => undefined,
    notify: async () => undefined,
    secureScreen: async () => undefined,
    installUpdate: async () => undefined,
  };
}
