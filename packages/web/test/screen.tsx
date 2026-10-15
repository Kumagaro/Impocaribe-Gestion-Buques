// T038 · Pruebas de componente de una pantalla (plan §11.2): su hook real y sus tres presentaciones, con la plataforma
// de prueba (copia local en sql.js), el servidor falso que responde desde los esquemas compartidos y un router en memoria.
import { act, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import type { PairingRecord } from '../src/connection/pairing';
import type { DeviceInfo, PlatformDiscovery } from '../src/platform/platform';
import { createTestPlatform, type TestPlatform } from '../src/platform/test-platform';
import { AppSession, type StoredSession } from '../src/session/app-session';
import { SessionProvider } from '../src/session/SessionProvider';
import type { DeviceClass } from '../src/ui/device';
import { createFakeServer, FIXED_TIME } from './fake-server';
import { renderUi } from './render';

export const TEST_PAIRING: PairingRecord = {
  serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
  serverName: 'IMPOCARIBE-7F3C',
  caFingerprint: 'AA:BB',
  lastAddress: { address: 'servidor.test', port: 443 },
  deviceId: 'dispositivo-de-pruebas',
  deviceSecret: 'secreto-de-pruebas',
  deviceName: 'PC OFICINA',
  isServerPc: false,
};

export interface ScreenTest {
  server: ReturnType<typeof createFakeServer>;
  platform: TestPlatform;
  session: AppSession;
  router: ReturnType<typeof createMemoryRouter>;
  view: RenderResult;
}

/**
 * Monta `element` en `path` con las otras rutas indicadas como marcas simples ("Pantalla /ruta"), para comprobar a
 * dónde navega.
 */
export async function renderScreen(
  element: ReactElement,
  options: {
    path?: string;
    device?: DeviceClass;
    reduceMotion?: boolean;
    pairing?: PairingRecord | null;
    session?: StoredSession | null;
    discovery?: PlatformDiscovery;
    deviceInfo?: DeviceInfo;
    scanQr?: () => Promise<string | null>;
    otherRoutes?: string[];
    /** Prepara las respuestas del servidor antes de montar la pantalla. */
    before?: (server: ReturnType<typeof createFakeServer>) => void;
  } = {},
): Promise<ScreenTest> {
  const server = createFakeServer({ baseUrl: 'https://servidor.test:443/api/v1' });
  options.before?.(server);
  const platform = await createTestPlatform({
    http: server.transport,
    ...(options.discovery ? { discovery: options.discovery } : {}),
    ...(options.deviceInfo ? { deviceInfo: options.deviceInfo } : {}),
    ...(options.scanQr ? { scanQr: options.scanQr } : {}),
  });
  const session = new AppSession(platform, '1.0.0', () => new Date(FIXED_TIME));
  await session.load();
  const pairing = options.pairing === undefined ? TEST_PAIRING : options.pairing;
  if (pairing) await session.paired(pairing);
  if (options.session) await session.signedIn(options.session);
  const path = options.path ?? '/';
  const routes: RouteObject[] = [
    { path, element },
    ...(options.otherRoutes ?? []).map((p) => ({ path: p, element: <p>Pantalla {p}</p> })),
  ];
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  let view!: RenderResult;
  await act(async () => {
    view = renderUi(
      <SessionProvider session={session}>
        <RouterProvider router={router} />
      </SessionProvider>,
      { device: options.device ?? 'desktop', reduceMotion: options.reduceMotion ?? false },
    );
  });
  return { server, platform, session, router, view };
}
