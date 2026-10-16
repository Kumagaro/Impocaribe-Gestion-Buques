// T036 · Red simulada para probar el descubrimiento (plan §11.2: "red simulada"): servidores con su dirección, y la
// posibilidad de bloquear la multidifusión o la difusión como lo hacen algunos routers y hotspots. Cada respuesta tarda
// `latencyMs`; un método bloqueado no responde nunca y el que llama debe rendirse por tiempo.
import type { PlatformDiscovery, ServerAnnouncement } from './platform';

export interface SimulatedNetwork extends PlatformDiscovery {
  servers: ServerAnnouncement[];
  multicastBlocked: boolean;
  broadcastBlocked: boolean;
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
  } = {},
): SimulatedNetwork {
  const latency = options.latencyMs ?? 20;
  const subnet = options.subnet ?? '192.168.1';
  const net: SimulatedNetwork = {
    servers: options.servers ?? [],
    multicastBlocked: options.multicastBlocked ?? false,
    broadcastBlocked: options.broadcastBlocked ?? false,
    probed: [],
    browse: () => (net.multicastBlocked ? never() : after(latency, [...net.servers])),
    broadcast: () => (net.broadcastBlocked ? never() : after(latency, [...net.servers])),
    probe: (address, port) => {
      net.probed.push(address);
      const found = net.servers.find((s) => s.address === address && s.port === port);
      // Una dirección sin servidor no contesta: quien pregunta se rinde por tiempo.
      return found ? after(latency, found) : never();
    },
    subnetAddresses: async () => Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`),
  };
  return net;
}
