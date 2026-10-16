// T036 · RF-RED-02 y DT-20: busca el servidor probando en orden la última dirección conocida, el anuncio DNS-SD, la
// difusión y la subred. Si el dispositivo ya está emparejado, solo vale el servidor con su identidad y la huella de su
// CA (RF-RED-03): cualquier otro que se anuncie se ignora. Lo que esto encuentra son candidatos; la identidad se
// comprueba de verdad al conectar, con la cadena del certificado (DT-18).
import type { DiscoveryMethod, PlatformDiscovery, ServerAnnouncement } from '../platform/platform';

/** Lo que el dispositivo aprendió al emparejarse (se guarda en el almacenamiento seguro). */
export interface PairedServer {
  serverId: string;
  caFingerprint: string;
  lastAddress?: { address: string; port: number } | undefined;
}

export interface FoundServer extends ServerAnnouncement {
  method: DiscoveryMethod;
}

/**
 * Tiempo de cada método. Sumados quedan por debajo de los 10 s de RNF-17, aunque haya que recorrer la subred: 254
 * direcciones de 64 en 64 son 4 tandas.
 */
export const DISCOVERY_TIMEOUTS = { last: 1500, dnssd: 2500, broadcast: 2000, subnetProbe: 800 } as const;
const SUBNET_PARALLEL = 64;
const SUBNET_ROUNDS = Math.ceil(254 / SUBNET_PARALLEL);
export const DISCOVERY_BUDGET_MS =
  DISCOVERY_TIMEOUTS.last +
  DISCOVERY_TIMEOUTS.dnssd +
  DISCOVERY_TIMEOUTS.broadcast +
  SUBNET_ROUNDS * DISCOVERY_TIMEOUTS.subnetProbe;
/** Puerto del servidor (plan §6): el de la búsqueda en la subred. */
export const SERVER_PORT = 8443;

const normalize = (fingerprint: string) => fingerprint.replaceAll(':', '').toLowerCase();

/** La respuesta, o `fallback` si no llega a tiempo. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** Pregunta a una dirección concreta (la propia PC o una escrita a mano); null si no contesta a tiempo. */
export function probeServer(discovery: PlatformDiscovery, address: string, port: number, timeoutMs: number) {
  return withTimeout(discovery.probe(address, port, timeoutMs), timeoutMs, null);
}

export async function findServer(
  discovery: PlatformDiscovery,
  paired: PairedServer | null,
  onMethod: (method: DiscoveryMethod) => void = () => undefined,
): Promise<FoundServer | null> {
  const isOurs = (a: ServerAnnouncement | null): a is ServerAnnouncement =>
    a !== null &&
    (!paired || (a.serverId === paired.serverId && normalize(a.caFingerprint) === normalize(paired.caFingerprint)));
  const pick = (list: (ServerAnnouncement | null)[], method: DiscoveryMethod): FoundServer | null => {
    const found = list.find(isOurs);
    return found ? { ...found, method } : null;
  };

  if (paired?.lastAddress) {
    onMethod('last');
    const { address, port } = paired.lastAddress;
    const found = pick(
      [await withTimeout(discovery.probe(address, port, DISCOVERY_TIMEOUTS.last), DISCOVERY_TIMEOUTS.last, null)],
      'last',
    );
    if (found) return found;
  }

  onMethod('dnssd');
  const announced = await withTimeout(discovery.browse(DISCOVERY_TIMEOUTS.dnssd), DISCOVERY_TIMEOUTS.dnssd, []);
  const byDnsSd = pick(announced, 'dnssd');
  if (byDnsSd) return byDnsSd;

  onMethod('broadcast');
  const answered = await withTimeout(
    discovery.broadcast(DISCOVERY_TIMEOUTS.broadcast),
    DISCOVERY_TIMEOUTS.broadcast,
    [],
  );
  const byBroadcast = pick(answered, 'broadcast');
  if (byBroadcast) return byBroadcast;

  onMethod('subnet');
  const addresses = await discovery.subnetAddresses();
  for (let i = 0; i < addresses.length; i += SUBNET_PARALLEL) {
    const batch = addresses
      .slice(i, i + SUBNET_PARALLEL)
      .map((address) =>
        withTimeout(
          discovery.probe(address, SERVER_PORT, DISCOVERY_TIMEOUTS.subnetProbe),
          DISCOVERY_TIMEOUTS.subnetProbe,
          null,
        ),
      );
    const found = pick(await Promise.all(batch), 'subnet');
    if (found) return found;
  }
  return null;
}
