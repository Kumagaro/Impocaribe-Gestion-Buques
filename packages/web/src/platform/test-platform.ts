// T019 · Implementación de prueba de `platform` (DT-03): SQLite real en memoria con sql.js, almacenamiento seguro en
// memoria y registro de las llamadas al sistema para que las pruebas de componente las comprueben.
import { createSimulatedNetwork } from './test-discovery';
import { openSqlJsDatabase } from './sqljs';
import type { DeviceInfo, HttpTransport, Platform, PlatformDiscovery, PlatformSocket } from './platform';

export type TestPlatform = Platform & { calls: { method: string; args: unknown[] }[] };

export async function createTestPlatform(
  options: {
    deviceInfo?: DeviceInfo;
    http?: HttpTransport;
    ws?: (url: string) => PlatformSocket;
    discovery?: PlatformDiscovery;
    /** El texto que "lee" la cámara; sin él, la plataforma no tiene cámara. */
    scanQr?: () => Promise<string | null>;
  } = {},
): Promise<TestPlatform> {
  const info: DeviceInfo = options.deviceInfo ?? { platform: 'windows', appVersion: '0.0.0', smallestWidthDp: 768 };
  const secrets = new Map<string, string>();
  const calls: TestPlatform['calls'] = [];
  const record =
    (method: string) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
    };
  return {
    calls,
    deviceInfo: () => info,
    // Para probar contra un servidor real, se pasa el transporte Node de @impocaribe/shared/node, que verifica la identidad.
    http:
      options.http ??
      (async () => {
        throw new Error('La plataforma de prueba no tiene transporte HTTP: pase uno en createTestPlatform({ http }).');
      }),
    ws:
      options.ws ??
      (() => {
        throw new Error('La plataforma de prueba no tiene WebSocket: pase uno en createTestPlatform({ ws }).');
      }),
    // La red simulada de test-discovery.ts, o una vacía.
    discovery: options.discovery ?? createSimulatedNetwork(),
    secureStorage: {
      get: async (key) => secrets.get(key) ?? null,
      set: async (key, value) => {
        secrets.set(key, value);
      },
      remove: async (key) => {
        secrets.delete(key);
      },
    },
    openDatabase: () => openSqlJsDatabase(),
    saveFile: record('saveFile'),
    notify: record('notify'),
    secureScreen: record('secureScreen'),
    installUpdate: record('installUpdate'),
    ...(options.scanQr ? { scanQr: options.scanQr } : {}),
  };
}
