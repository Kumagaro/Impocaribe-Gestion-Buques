// T036 · Red simulada para probar el descubrimiento (plan §11.2: "red simulada"): servidores con su dirección, y la
// posibilidad de bloquear la multidifusión o la difusión como lo hacen algunos routers y hotspots. Cada respuesta tarda
// `latencyMs`; un método bloqueado no responde nunca y el que llama debe rendirse por tiempo.
import type { PlatformDiscovery, ServerAnnouncement } from './platform';

export interface SimulatedNetwork extends PlatformDiscovery {
  servers: ServerAnnouncement[];
  multicastBlocked: boolean;
  broadcastBlocked: boolean;
  /** El router aísla a los clientes: no se ve ningún otro equipo, tampoco el servidor (RF-RED-06). */
  isolated: boolean;
  /** El dispositivo está conectado a una red. */
  connected: boolean;
  /** Las direcciones que se consultaron una a una, en orden. */
  probed: string[];
}

const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const never = <T>() => new Promise<T>(() => undefined);

export function createSimulatedNetwork(
  options: {
    servers?: ServerAnnouncement[];
    multicastBlocked?: boolean;
    broadcastBlocked?: boolean;
    latencyMs?: number;
    subnet?: string;
    isolated?: boolean;
    connected?: boolean;
    wifi?: string | null;
  } = {},
): SimulatedNetwork {
  const latency = options.latencyMs ?? 20;
  const subnet = options.subnet ?? '192.168.1';
  const net: SimulatedNetwork = {
    servers: options.servers ?? [],
    multicastBlocked: options.multicastBlocked ?? false,
    broadcastBlocked: options.broadcastBlocked ?? false,
    isolated: options.isolated ?? false,
    connected: options.connected ?? true,
    probed: [],
    browse: () => (net.multicastBlocked || !reachable() ? never() : after(latency, [...net.servers])),
    broadcast: () => (net.broadcastBlocked || !reachable() ? never() : after(latency, [...net.servers])),
    probe: (address, port) => {
      net.probed.push(address);
      const found = reachable() && net.servers.find((s) => s.address === address && s.port === port);
      // Una dirección sin servidor no contesta: quien pregunta se rinde por tiempo.
      return found ? after(latency, found) : never();
    },
    subnetAddresses: async () => Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`),
    lan: () =>
      after(latency, {
        wifi: net.connected ? wifi : null,
        gatewayReachable: net.connected,
        peersVisible: reachable(),
      }),
  };
  const wifi = options.wifi === undefined ? 'IMPOCARIBE-WIFI' : options.wifi;
  const reachable = () => net.connected && !net.isolated;
  return net;
}
