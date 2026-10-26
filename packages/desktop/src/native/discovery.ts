// T115 · DT-20, RF-RED-02 y plan §10.1: la búsqueda del servidor desde el proceso principal. DNS-SD (`_impocaribe._tcp`)
// y difusión UDP al puerto 47800 en cada interfaz de la red local, la sonda a /api/v1/discovery y las direcciones de la
// subred /24. Lo anunciado no prueba nada: la identidad se comprueba al conectar (DT-18).
import { BROADCAST_PORT, BROADCAST_PROBE, SERVICE_TYPE } from '@impocaribe/shared';
import { createSocket } from 'node:dgram';
import { request } from 'node:https';
import { request as plainRequest } from 'node:http';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import makeMdns from 'multicast-dns';

export interface Announcement {
  address: string;
  port: number;
  serverId: string;
  caFingerprint: string;
  version: string;
}

interface Interface {
  address: string;
  netmask: string;
}

/** Las interfaces IPv4 de la red local (cable, wifi, hotspot); sin la de bucle. */
export function lanInterfaces(all: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): Interface[] {
  return Object.values(all)
    .flat()
    .filter((i): i is NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => ({ address: i.address, netmask: i.netmask }));
}

const toInt = (ip: string) => ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
const toIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

/** La dirección de difusión de cada interfaz (con su máscara), más la general. */
export function broadcastTargets(interfaces: Interface[]): string[] {
  const targets = interfaces.map((i) => toIp((toInt(i.address) | ~toInt(i.netmask)) >>> 0));
  return [...new Set([...targets, '255.255.255.255'])];
}

/** DT-20: las direcciones de la /24 de cada interfaz, sin la propia, para buscar una a una. */
export function subnetAddresses(interfaces: Interface[]): string[] {
  const out = new Set<string>();
  for (const i of interfaces) {
    const base = toInt(i.address) & 0xffffff00;
    for (let host = 1; host < 255; host++) {
      const ip = toIp((base | host) >>> 0);
      if (ip !== i.address) out.add(ip);
    }
  }
  return [...out];
}

type Record = { name: string; type: string; data: unknown };

/** Lee una respuesta DNS-SD: el SRV (puerto), el TXT (id, v, fp) y la A (dirección) de cada instancia. */
export function parseDnsSd(records: Record[]): Announcement[] {
  const instances = records.filter((r) => r.type === 'PTR' && r.name === SERVICE_TYPE).map((r) => String(r.data));
  const found: Announcement[] = [];
  for (const instance of instances) {
    const srv = records.find((r) => r.type === 'SRV' && r.name === instance)?.data as
      { port: number; target: string } | undefined;
    const txt = records.find((r) => r.type === 'TXT' && r.name === instance)?.data as (Buffer | string)[] | undefined;
    const address = srv && (records.find((r) => r.type === 'A' && r.name === srv.target)?.data as string | undefined);
    if (!srv || !txt || !address) continue;
    const fields = Object.fromEntries(
      txt.map((t) => {
        const s = t.toString();
        const at = s.indexOf('=');
        return [s.slice(0, at), s.slice(at + 1)];
      }),
    );
    if (fields.id && fields.fp)
      found.push({ address, port: srv.port, serverId: fields.id, caFingerprint: fields.fp, version: fields.v ?? '' });
  }
  return found;
}

const unique = (list: Announcement[]) => [
  ...new Map(list.map((a) => [`${a.serverId}@${a.address}:${a.port}`, a])).values(),
];

/** DNS-SD durante `timeoutMs`, preguntando por cada interfaz (en Windows la multidifusión sale por una sola). */
export function browse(
  timeoutMs: number,
  options: { port?: number; interfaces?: Interface[] } = {},
): Promise<Announcement[]> {
  const interfaces = options.interfaces ?? lanInterfaces();
  const found: Announcement[] = [];
  const sockets = interfaces.map((i) => {
    // loopback: también un servidor en esta misma PC (la del instalador completo) responde a la pregunta.
    const mdns = makeMdns({
      interface: i.address,
      ...(options.port ? { port: options.port } : {}),
      loopback: true,
      multicast: true,
      reuseAddr: true,
    });
    mdns.on('response', (res) =>
      found.push(...parseDnsSd([...(res.answers ?? []), ...(res.additionals ?? [])] as Record[])),
    );
    mdns.on('ready', () => mdns.query({ questions: [{ name: SERVICE_TYPE, type: 'PTR' }] }));
    mdns.on('error', () => undefined);
    return mdns;
  });
  return new Promise((resolve) =>
    setTimeout(() => {
      for (const s of sockets) s.destroy();
      resolve(unique(found));
    }, timeoutMs),
  );
}

/** Difusión UDP al puerto 47800: el servidor responde con identidad, versión, huella y puerto. */
export function broadcast(
  timeoutMs: number,
  options: { port?: number; targets?: string[] } = {},
): Promise<Announcement[]> {
  const socket = createSocket({ type: 'udp4', reuseAddr: true });
  const found: Announcement[] = [];
  socket.on('message', (msg, from) => {
    try {
      const a = JSON.parse(msg.toString('utf8')) as Partial<Announcement>;
      if (typeof a.serverId === 'string' && typeof a.caFingerprint === 'string' && typeof a.port === 'number')
        found.push({
          address: from.address,
          port: a.port,
          serverId: a.serverId,
          caFingerprint: a.caFingerprint,
          version: String(a.version ?? ''),
        });
    } catch {
      // Otra cosa en el puerto: no es un servidor.
    }
  });
  socket.on('error', () => undefined);
  return new Promise((resolve) => {
    socket.bind(0, () => {
      socket.setBroadcast(true);
      const probe = Buffer.from(BROADCAST_PROBE);
      for (const target of options.targets ?? broadcastTargets(lanInterfaces()))
        socket.send(probe, options.port ?? BROADCAST_PORT, target, () => undefined);
      setTimeout(() => {
        socket.close();
        resolve(unique(found));
      }, timeoutMs);
    });
  });
}

/**
 * GET /api/v1/discovery. Sin verificar la cadena: solo se lee el anuncio (la identidad se comprueba al conectar). `http`
 * solo para las pruebas con el servidor sin TLS.
 */
export function probe(
  address: string,
  port: number,
  timeoutMs: number,
  scheme: 'https' | 'http' = 'https',
): Promise<Announcement | null> {
  return new Promise((resolve) => {
    const send = scheme === 'https' ? request : plainRequest;
    const req = send(
      { host: address, port, path: '/api/v1/discovery', method: 'GET', timeout: timeoutMs, rejectUnauthorized: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Partial<Announcement>;
            resolve(
              res.statusCode === 200 && body.serverId && body.caFingerprint
                ? {
                    address,
                    port,
                    serverId: body.serverId,
                    caFingerprint: body.caFingerprint,
                    version: String(body.version ?? ''),
                  }
                : null,
            );
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end();
  });
}
