// T048 · P-30 Diagnóstico de red: la lógica (plan §7.3). RF-RED-06: si el servidor se encuentra y por qué método, la
// dirección y el tiempo de respuesta, si la red bloquea la comunicación entre equipos y qué hacer en cada caso. Se usa
// con o sin sesión, y sin emparejar.
import { havanaDateTime, serverName } from '@impocaribe/shared';
import { useCallback, useEffect, useState } from 'react';
import { localApi } from '../../api/endpoints/local';
import { DISCOVERY_TIMEOUTS, findServer, probeServer, type FoundServer } from '../../connection/discovery';
import type { DiscoveryMethod, LanStatus } from '../../platform/platform';
import { useAppSession } from '../../session/SessionProvider';
import { useSyncStatus } from '../../sync/SyncProvider';

export type Verdict = 'checking' | 'ok' | 'down' | 'isolated' | 'no-network';

const METHOD_LABEL: Record<DiscoveryMethod, string> = {
  last: 'Última dirección conocida',
  dnssd: 'Anuncio del servidor en la red',
  broadcast: 'Mensaje de difusión',
  subnet: 'Direcciones de la red local',
  manual: 'Dirección escrita',
  qr: 'QR del servidor',
};

export const STEPS: Record<Exclude<Verdict, 'checking' | 'ok'>, string[]> = {
  down: [
    'Compruebe que la PC servidor está encendida y no está en suspensión.',
    'Compruebe que este dispositivo está en la misma red wifi que la PC servidor.',
    'Si nada cambia, avise a la Apoderada.',
  ],
  isolated: [
    'En el router o en el celular que hace de hotspot, desactive el «aislamiento de clientes» (AP isolation).',
    'Si está en una red de invitados, conéctese a la red principal.',
    'Si no puede cambiarlo, avise a la Apoderada.',
  ],
  'no-network': [
    'Active el wifi y conéctese a la red de la oficina o al hotspot del servidor.',
    'Si ya está conectado, apague y vuelva a encender el wifi.',
  ],
};

/** "hace 4 segundos", "hace 6 minutos" y, desde las 2 horas, la fecha y hora en La Habana. */
export function relativeTime(iso: string, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (s < 60) return `hace ${s} ${s === 1 ? 'segundo' : 'segundos'}`;
  const m = Math.floor(s / 60);
  if (m < 120) return `hace ${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  return `el ${havanaDateTime(new Date(iso))}`;
}

interface Result {
  found: FoundServer | null;
  lan: LanStatus | null;
  responseMs: number | null;
  /** T128: en la PC servidor, su montaje de red y los dispositivos conectados ahora. */
  local: { setup: 'router' | 'hotspot' | null; connected: number } | null;
}

export function useDiagnostics() {
  const { session, state } = useAppSession();
  const sync = useSyncStatus();
  const discovery = session.device.discovery;
  const pairing = state.pairing;
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    const [found, lan] = await Promise.all([
      findServer(discovery, pairing),
      discovery.lan ? discovery.lan().catch(() => null) : Promise.resolve(null),
    ]);
    let responseMs: number | null = null;
    if (found) {
      const started = performance.now();
      const again = await probeServer(discovery, found.address, found.port, DISCOVERY_TIMEOUTS.last);
      if (again) responseMs = Math.round(performance.now() - started);
    }
    // T128 · P-30 en la PC servidor: el montaje y los conectados, de su propio estado (solo desde 127.0.0.1).
    let local: Result['local'] = null;
    if (pairing?.isServerPc && found)
      local = await session
        .api()
        .request(localApi.status)
        .then((s) => ({ setup: s.network.setup, connected: s.devices.filter((d) => d.connected).length }))
        .catch(() => null);
    setResult({ found, lan, responseMs, local });
    setRunning(false);
  }, [discovery, pairing, session]);

  useEffect(() => {
    void run();
  }, [run]);

  const verdict: Verdict =
    running || !result
      ? 'checking'
      : result.found
        ? 'ok'
        : result.lan && !result.lan.gatewayReachable
          ? 'no-network'
          : result.lan && !result.lan.peersVisible
            ? 'isolated'
            : 'down';

  const now = session.now();
  const lastSync = sync.syncedAt ? relativeTime(sync.syncedAt, now) : null;
  const message = {
    checking: 'Buscando el servidor por todos los métodos.',
    ok: 'El servidor responde y su identidad está verificada.',
    down: lastSync ? `Última respuesta ${lastSync}.` : 'No hay respuesta desde que se abrió la app.',
    isolated: 'Este dispositivo llega al router, pero no a los demás equipos de la red.',
    'no-network': 'Sin red no se puede llegar al servidor.',
  }[verdict];
  const title = {
    checking: 'Comprobando la conexión…',
    ok: 'Todo bien',
    down: 'El servidor no responde',
    isolated: 'La red bloquea la comunicación entre equipos',
    'no-network': 'Este dispositivo no está conectado a ninguna red',
  }[verdict];

  const found = result?.found ?? null;
  const address = found ?? pairing?.lastAddress ?? null;
  const identity = found ? serverName(found.serverId) : (pairing?.serverName ?? null);
  const details = [
    {
      label: 'Red wifi',
      value: result?.lan ? (result.lan.gatewayReachable ? (result.lan.wifi ?? 'Conectado') : 'Sin red') : '—',
    },
    { label: 'Método', value: found ? METHOD_LABEL[found.method] : '—' },
    { label: 'Dirección', value: address ? `${address.address}:${address.port}` : '—' },
    {
      label: 'Tiempo de respuesta',
      value: verdict === 'checking' ? '—' : result?.responseMs != null ? `${result.responseMs} ms` : 'Sin respuesta',
    },
    {
      label: 'Identidad',
      value: identity ? `${identity} · ${!pairing ? 'Sin emparejar' : found ? 'Verificada' : 'Sin verificar'}` : '—',
    },
    { label: 'Última sincronización', value: lastSync ?? '—' },
    ...(result?.local
      ? [
          {
            label: 'Montaje de red',
            value: result.local.setup === 'hotspot' ? 'Hotspot de un celular' : 'Router wifi',
          },
          { label: 'Dispositivos conectados', value: String(result.local.connected) },
        ]
      : []),
  ];

  return {
    verdict,
    tone: ({ checking: 'info', ok: 'ok', isolated: 'warn', down: 'bad', 'no-network': 'bad' } as const)[verdict],
    title,
    message,
    steps: verdict === 'checking' || verdict === 'ok' ? [] : STEPS[verdict],
    details,
    running,
    retry: () => void run(),
  };
}

export type DiagnosticsModel = ReturnType<typeof useDiagnostics>;
