import { createSocket } from 'node:dgram';
import makeMdns from 'multicast-dns';
import { lanAddress } from '../../test/app.ts';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BROADCAST_PROBE,
  dnsSdRecords,
  SERVICE_TYPE,
  startBroadcastResponder,
  startMdnsAnnouncer,
  type DiscoveryInfo,
} from './announce.ts';

// T034 · RF-RED-02, DT-20: el servidor se anuncia por DNS-SD (_impocaribe._tcp), responde a la difusión UDP 47800 y
// publica GET /discovery. El anuncio incluye identidad, versión y huella; la respuesta a difusión no revela nada más.
const INFO: DiscoveryInfo = {
  serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
  name: 'IMPOCARIBE-7F3C',
  version: '1.4.0',
  caFingerprint: 'B2:99:E6:FB:83:56:99:BC:6C:95:39:54:06:8C:89:82:B1:0B:E0:26:EA:79:49:D7:A6:ED:10:2A:0C:0D:F5:4D',
  port: 8443,
};
const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map((s) => s()));
});

describe('dnsSdRecords (DNS-SD, RFC 6763)', () => {
  it('anuncia el servicio con su instancia, puerto, identidad, versión y huella', () => {
    const records = dnsSdRecords(INFO, ['192.168.1.10']);
    const instance = `IMPOCARIBE-7F3C.${SERVICE_TYPE}`;
    expect(records).toEqual([
      { name: SERVICE_TYPE, type: 'PTR', ttl: 120, data: instance },
      {
        name: instance,
        type: 'SRV',
        ttl: 120,
        data: { port: 8443, target: 'IMPOCARIBE-7F3C.local', priority: 0, weight: 0 },
      },
      {
        name: instance,
        type: 'TXT',
        ttl: 120,
        data: [`id=${INFO.serverId}`, 'v=1.4.0', `fp=${INFO.caFingerprint}`],
      },
      { name: 'IMPOCARIBE-7F3C.local', type: 'A', ttl: 120, data: '192.168.1.10' },
    ]);
    expect(SERVICE_TYPE).toBe('_impocaribe._tcp.local');
  });
});

describe('respuesta a la difusión UDP', () => {
  it('a la sonda responde solo identidad, versión, huella y puerto', async () => {
    const stop = await startBroadcastResponder(INFO, { port: 0 });
    stops.push(stop.close);
    const reply = await probe(stop.port, BROADCAST_PROBE);
    expect(JSON.parse(reply!)).toEqual({
      serverId: INFO.serverId,
      version: '1.4.0',
      caFingerprint: INFO.caFingerprint,
      port: 8443,
    });
  });

  it('a cualquier otro mensaje no responde', async () => {
    const stop = await startBroadcastResponder(INFO, { port: 0 });
    stops.push(stop.close);
    expect(await probe(stop.port, 'hola')).toBeNull();
  });

  it('usa el puerto 47800 por defecto (DT-20)', async () => {
    const stop = await startBroadcastResponder(INFO);
    stops.push(stop.close);
    expect(stop.port).toBe(47800);
  });
});

describe('anuncio mDNS real', () => {
  it('quien pregunta por _impocaribe._tcp recibe la instancia con su TXT', async () => {
    const port = 15353;
    // Por la interfaz de la red local, como en una PC servidor real (con varias tarjetas no basta la de por defecto).
    const lan = lanAddress()!;
    const stop = startMdnsAnnouncer(INFO, { port, interfaces: () => [lan] });
    stops.push(stop);
    const client = makeMdns({ port, interface: lan, loopback: true, multicast: true, reuseAddr: true });
    stops.push(() => new Promise((r) => client.destroy(() => r())));
    const answers = await new Promise<{ type: string; data: unknown }[]>((resolve) => {
      client.on('response', (res) => {
        const all = [...(res.answers ?? []), ...(res.additionals ?? [])];
        if (all.some((a) => a.type === 'PTR' && a.name === SERVICE_TYPE)) resolve(all as never);
      });
      client.on('ready', () => client.query({ questions: [{ name: SERVICE_TYPE, type: 'PTR' }] }));
    });
    const txt = answers.find((a) => a.type === 'TXT')!.data as Buffer[];
    expect(txt.map((b) => b.toString())).toEqual([`id=${INFO.serverId}`, 'v=1.4.0', `fp=${INFO.caFingerprint}`]);
    expect((answers.find((a) => a.type === 'SRV')!.data as { port: number }).port).toBe(8443);
    expect(answers.find((a) => a.type === 'A')!.data).toBe(lan);
  });
});

function probe(port: number, message: string): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    const timer = setTimeout(() => {
      socket.close();
      resolve(null);
    }, 500);
    socket.on('message', (msg) => {
      clearTimeout(timer);
      socket.close();
      resolve(msg.toString('utf8'));
    });
    socket.send(message, port, '127.0.0.1');
  });
}
