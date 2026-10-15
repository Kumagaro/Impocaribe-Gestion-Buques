// T038 · Plataforma del navegador de desarrollo y de las pruebas de extremo a extremo (plan §11.2: "en el navegador con
// un transporte de prueba"). Las apps registran siempre la suya, nativa (Electron, T115; Android, T118): esta solo se
// usa cuando no hay ninguna. No verifica la identidad del servidor (lo hace el transporte nativo, DT-19) y guarda los
// secretos en sessionStorage, que muere con la pestaña: sirve para probar, nunca para trabajar.
import type { DeviceInfo, Platform, PlatformDiscovery, ServerAnnouncement } from './platform';

/** `?server=127.0.0.1:8444`: el servidor que el navegador "encuentra" como si se anunciara en la red. */
export function serverFromSearch(search: string): { address: string; port: number } | null {
  const value = new URLSearchParams(search).get('server');
  const match = value?.match(/^([\w.-]+):(\d{1,5})$/);
  return match ? { address: match[1]!, port: Number(match[2]) } : null;
}

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

export function browserDiscovery(search: string): PlatformDiscovery {
  const configured = serverFromSearch(search);
  const announce = async (timeoutMs: number) => {
    if (!configured) return [];
    const found = await probe(configured.address, configured.port, timeoutMs);
    return found ? [found] : [];
  };
  return { browse: announce, broadcast: announce, probe, subnetAddresses: async () => [] };
}

export function createBrowserPlatform(search: string, appVersion: string): Platform {
  const info: DeviceInfo = { platform: 'windows', appVersion, smallestWidthDp: 1024 };
  const storage = window.sessionStorage;
  return {
    serverScheme: 'http',
    http: (url, init) => fetch(url, init),
    ws: () => {
      throw new Error('El WebSocket llega con la sincronización (T043).');
    },
    discovery: browserDiscovery(search),
    deviceInfo: () => info,
    secureStorage: {
      get: async (key) => storage.getItem(`impocaribe-prueba:${key}`),
      set: async (key, value) => storage.setItem(`impocaribe-prueba:${key}`, value),
      remove: async (key) => storage.removeItem(`impocaribe-prueba:${key}`),
    },
    openDatabase: () => Promise.reject(new Error('La copia local llega con la sincronización (T044).')),
    saveFile: async () => undefined,
    notify: async () => undefined,
    secureScreen: async () => undefined,
    installUpdate: async () => undefined,
  };
}
