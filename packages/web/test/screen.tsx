// T038 · Pruebas de componente de una pantalla (plan §11.2): su hook real y sus tres presentaciones, con la plataforma
// de prueba (copia local en sql.js), el servidor falso que responde desde los esquemas compartidos y un router en memoria.
import { act, type RenderResult } from '@testing-library/react';
import { StrictMode, type ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SyncEntity } from '@impocaribe/shared/validation';
import { getSyncChanges, getSyncSnapshot, getSyncState } from '../src/api/endpoints/sync';
import { SyncGate } from '../src/sync/SyncGate';
import { SyncProvider } from '../src/sync/SyncProvider';
import type { PairingRecord } from '../src/connection/pairing';
import type { DeviceInfo, Platform, PlatformDiscovery } from '../src/platform/platform';
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
    /** El patrón de la ruta si tiene parámetros (por ejemplo `/perfil/:seccion?`); `path` es donde se abre. */
    route?: string;
    device?: DeviceClass;
    reduceMotion?: boolean;
    pairing?: PairingRecord | null;
    session?: StoredSession | null;
    discovery?: PlatformDiscovery;
    deviceInfo?: DeviceInfo;
    scanQr?: () => Promise<string | null>;
    otherRoutes?: string[];
    /** Como main.tsx: StrictMode monta dos veces los efectos en desarrollo. */
    strict?: boolean;
    /** Con sesión: los registros de la copia local que traerá la primera sincronización (T045). */
    local?: { entityType: SyncEntity; entityId: string; payload: unknown }[];
    /** Con sesión y `false`: el servidor no responde (RF-CON-05). */
    online?: boolean;
    /** T114: la instalación de una versión que haría la app (por defecto solo se registra). */
    installUpdate?: Platform['installUpdate'];
    /** T127: el ayudante de instalación de la PC servidor (P-28). */
    serverSetup?: Platform['serverSetup'];
    /** T128 · AL-22: traer la ventana al frente. */
    attention?: Platform['attention'];
    /** T133: el aviso al apagar la PC servidor. */
    reportServerPc?: Platform['reportServerPc'];
    /** R-01: la exclusión del ahorro de batería (Android). */
    batteryExclusion?: Platform['batteryExclusion'];
    /** Prepara las respuestas del servidor antes de montar la pantalla. */
    before?: (server: ReturnType<typeof createFakeServer>) => void;
  } = {},
): Promise<ScreenTest> {
  const server = createFakeServer({ baseUrl: 'https://servidor.test:443/api/v1' });
  if (options.session) syncResponses(server, options.local ?? [], options.online ?? true);
  options.before?.(server);
  const platform = await createTestPlatform({
    http: server.transport,
    ws: () => ({ send: () => undefined, close: () => undefined, on: () => undefined }),
    ...(options.discovery ? { discovery: options.discovery } : {}),
    ...(options.deviceInfo ? { deviceInfo: options.deviceInfo } : {}),
    ...(options.scanQr ? { scanQr: options.scanQr } : {}),
    ...(options.installUpdate ? { installUpdate: options.installUpdate } : {}),
    ...(options.serverSetup ? { serverSetup: options.serverSetup } : {}),
    ...(options.attention ? { attention: options.attention } : {}),
    ...(options.reportServerPc ? { reportServerPc: options.reportServerPc } : {}),
    ...(options.batteryExclusion ? { batteryExclusion: options.batteryExclusion } : {}),
  });
  const session = new AppSession(platform, '1.0.0', () => new Date(FIXED_TIME));
  await session.load();
  const pairing = options.pairing === undefined ? TEST_PAIRING : options.pairing;
  if (pairing) await session.paired(pairing);
  if (options.session) await session.signedIn(options.session);
  if (options.session && options.online === false && options.local) {
    // Sin conexión, la copia es la de la última sincronización (RF-CON-05).
    const store = await session.localStore();
    await store.replace(
      options.local.map((r) => ({ ...r, op: 'upsert' as const, seq: 1, refDate: null })),
      1,
      { epoch: EPOCH, schemaVersion: 1 },
    );
    await store.setMeta({ syncedAt: FIXED_TIME });
  }
  const path = options.path ?? '/';
  const routes: RouteObject[] = [
    // Con sesión, como en la app: hasta tener copia local, la primera descarga (SyncGate).
    { path: options.route ?? path, element: options.session ? <SyncGate>{element}</SyncGate> : element },
    ...(options.otherRoutes ?? []).map((p) => ({ path: p, element: <p>Pantalla {p}</p> })),
  ];
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  let view!: RenderResult;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const tree = (
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={session}>
        {options.session ? (
          <SyncProvider>
            <RouterProvider router={router} />
          </SyncProvider>
        ) : (
          <RouterProvider router={router} />
        )}
      </SessionProvider>
    </QueryClientProvider>
  );
  await act(async () => {
    view = renderUi(options.strict ? <StrictMode>{tree}</StrictMode> : tree, {
      device: options.device ?? 'desktop',
      reduceMotion: options.reduceMotion ?? false,
    });
  });
  // Como el usuario: con sesión, la pantalla aparece cuando termina la primera sincronización (SyncGate).
  if (options.session) await act(async () => (await session.startSync()).syncNow());
  return { server, platform, session, router, view };
}

/** La época de las sesiones de prueba. */
export const TEST_EPOCH = '0199f0a1-0000-7000-8000-0000000000e1';
const EPOCH = TEST_EPOCH;

/** La sincronización de una sesión de prueba: una instantánea con `records` y nada más (o sin conexión). */
export function syncResponses(
  server: ReturnType<typeof createFakeServer>,
  records: { entityType: SyncEntity; entityId: string; payload: unknown }[],
  online: boolean,
) {
  const down = () => {
    throw new Error('El servidor no responde');
  };
  server.respond(getSyncState, online ? { epoch: EPOCH, lastSeq: 1, schemaVersion: 1, serverTime: FIXED_TIME } : down);
  server.respond(
    getSyncSnapshot,
    online ? { epoch: EPOCH, seq: 1, records: records.map((r) => ({ ...r, refDate: null })), nextCursor: null } : down,
  );
  server.respond(getSyncChanges, online ? { changes: [], nextSince: 1, hasMore: false } : down);
}
