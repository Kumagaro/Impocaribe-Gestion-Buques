// T034 · RF-RED-02 y DT-20/27: el servidor se anuncia por DNS-SD (_impocaribe._tcp) y responde a la difusión UDP en
// el puerto 47800. Ambos dicen solo lo necesario para encontrarlo y comprobar que es él: identidad, versión, huella de
// la CA y puerto. La comprobación de verdad la hace el cliente con la cadena del certificado (DT-18).
import { createSocket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import makeMdns from 'multicast-dns';
import { BROADCAST_PORT, BROADCAST_PROBE, SERVICE_TYPE } from '@impocaribe/shared';

// Las constantes las comparte con la búsqueda de las apps (T115).
export { BROADCAST_PORT, BROADCAST_PROBE, SERVICE_TYPE } from '@impocaribe/shared';
const TTL = 120;

export interface DiscoveryInfo {
  serverId: string;
  name: string;
  version: string;
  caFingerprint: string;
  port: number;
}

type MdnsRecord = { name: string; type: 'PTR' | 'SRV' | 'TXT' | 'A'; ttl: number; data: unknown };

/** Registros DNS-SD del servicio (RFC 6763): PTR → instancia, SRV con el puerto, TXT con identidad, versión y huella. */
export function dnsSdRecords(info: DiscoveryInfo, addresses: string[]): MdnsRecord[] {
  const instance = `${info.name}.${SERVICE_TYPE}`;
  const host = `${info.name}.local`;
  return [
    { name: SERVICE_TYPE, type: 'PTR', ttl: TTL, data: instance },
    { name: instance, type: 'SRV', ttl: TTL, data: { port: info.port, target: host, priority: 0, weight: 0 } },
    {
      name: instance,
      type: 'TXT',
      ttl: TTL,
      data: [`id=${info.serverId}`, `v=${info.version}`, `fp=${info.caFingerprint}`],
    },
    ...addresses.map((a): MdnsRecord => ({ name: host, type: 'A', ttl: TTL, data: a })),
  ];
}

/** Direcciones IPv4 de la red local de esta PC (cambian con el hotspot: se leen en cada respuesta). */
export function localIPv4(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
}

/**
 * Responde a las preguntas por el servicio, y se anuncia al arrancar, en cada interfaz IPv4 de la red local: en Windows
 * con varias tarjetas (cable, wifi, VPN) la multidifusión por defecto sale por una sola. Cada interfaz responde con su
 * propia dirección. Si las interfaces cambian (se reinicia el hotspot, cambia la IP), se vuelve a anunciar en las nuevas.
 */
export function startMdnsAnnouncer(
  info: DiscoveryInfo,
  options: { port?: number; interfaces?: () => string[]; refreshMs?: number } = {},
): () => Promise<void> {
  const interfaces = options.interfaces ?? localIPv4;
  const running = new Map<string, ReturnType<typeof makeMdns>>();

  const open = (address: string) => {
    const mdns = makeMdns({
      ...(options.port ? { port: options.port } : {}),
      interface: address,
      loopback: true,
      reuseAddr: true,
    });
    const answer = () => {
      const [ptr, ...rest] = dnsSdRecords(info, [address]);
      mdns.respond({ answers: [ptr as never], additionals: rest as never[] });
    };
    mdns.on('query', (query) => {
      const names = (query.questions ?? []).map((q) => q.name);
      if (names.includes(SERVICE_TYPE) || names.includes(`${info.name}.${SERVICE_TYPE}`)) answer();
    });
    mdns.on('ready', answer);
    // Una interfaz que desaparece no debe tumbar el servidor: la próxima revisión la quita.
    mdns.on('error', () => undefined);
    running.set(address, mdns);
  };
  const close = (address: string) =>
    new Promise<void>((resolve) => {
      const mdns = running.get(address);
      running.delete(address);
      if (mdns) mdns.destroy(() => resolve());
      else resolve();
    });

  const refresh = () => {
    const now = new Set(interfaces());
    for (const address of [...running.keys()]) if (!now.has(address)) void close(address);
    for (const address of now) if (!running.has(address)) open(address);
  };
  refresh();
  const timer = setInterval(refresh, options.refreshMs ?? 10_000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await Promise.all([...running.keys()].map(close));
  };
}

/** Respuesta a la difusión UDP: solo identidad, versión, huella y puerto. */
export async function startBroadcastResponder(
  info: DiscoveryInfo,
  options: { port?: number } = {},
): Promise<{ port: number; close: () => Promise<void> }> {
  const socket = createSocket({ type: 'udp4', reuseAddr: true });
  const reply = Buffer.from(
    JSON.stringify({
      serverId: info.serverId,
      version: info.version,
      caFingerprint: info.caFingerprint,
      port: info.port,
    }),
  );
  socket.on('message', (msg, from) => {
    if (msg.toString('utf8') === BROADCAST_PROBE) socket.send(reply, from.port, from.address);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(options.port ?? BROADCAST_PORT, () => resolve());
  });
  return {
    port: socket.address().port,
    close: () => new Promise((resolve) => socket.close(() => resolve())),
  };
}
