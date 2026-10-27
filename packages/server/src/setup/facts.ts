// T126 · RF-INS-03.1-2 y RNF-19: los datos de esta PC para la comprobación del paso 0 (shared/domain/serverChecks.ts),
// y si ya responde otro servidor en la red (por la misma difusión UDP que usan las apps, plan §6.3).
import { execFile } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { statfs } from 'node:fs/promises';
import { createServer } from 'node:net';
import { arch, networkInterfaces, release, totalmem } from 'node:os';
import { promisify } from 'node:util';
import { BROADCAST_PORT, BROADCAST_PROBE, serverName, type PcFacts } from '@impocaribe/shared';
import { PG_PORT, SERVER_PORT } from './layout.ts';

const exec = promisify(execFile);

/** Un servidor de Órdenes de Carga que responda a la difusión en `ms`, o null. */
export function findServer(ms = 3000): Promise<{ name: string; address: string } | null> {
  return new Promise((resolve) => {
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    const done = (found: { name: string; address: string } | null) => {
      clearTimeout(timer);
      socket.close();
      resolve(found);
    };
    const timer = setTimeout(() => done(null), ms);
    socket.on('message', (msg, from) => {
      try {
        const reply = JSON.parse(msg.toString('utf8')) as { serverId?: unknown };
        if (typeof reply.serverId === 'string') done({ name: serverName(reply.serverId), address: from.address });
      } catch {
        // Otra cosa en ese puerto: se ignora.
      }
    });
    socket.on('error', () => done(null));
    socket.bind(0, () => {
      socket.setBroadcast(true);
      socket.send(BROADCAST_PROBE, BROADCAST_PORT, '255.255.255.255');
    });
  });
}

const portFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });

async function ssid(): Promise<string | null> {
  try {
    const { stdout } = await exec('netsh', ['wlan', 'show', 'interfaces'], { windowsHide: true });
    return /^\s*SSID\s*:\s*(.+)$/m.exec(stdout)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

async function hasBattery(): Promise<boolean> {
  try {
    const { stdout } = await exec(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_Battery | Measure-Object).Count'],
      { windowsHide: true, timeout: 15_000 },
    );
    return Number(stdout.trim()) > 0;
  } catch {
    return false;
  }
}

export async function gatherFacts(): Promise<PcFacts> {
  const disk = await statfs(`${process.env.SystemDrive ?? 'C:'}\\`);
  const lan = Object.entries(networkInterfaces())
    .flatMap(([name, list]) => (list ?? []).map((i) => ({ name, ...i })))
    .find((i) => i.family === 'IPv4' && !i.internal);
  const wifi = lan ? /wi-?fi|wlan|inal[aá]mbric/i.test(lan.name) : false;
  const ports = [SERVER_PORT, PG_PORT];
  const free = await Promise.all(ports.map(portFree));
  return {
    existingServer: await findServer(),
    windowsBuild: Number(release().split('.')[2] ?? 0),
    is64bit: arch() === 'x64',
    memoryBytes: totalmem(),
    freeDiskBytes: disk.bavail * disk.bsize,
    network: lan
      ? { kind: wifi ? 'wifi' : 'cable', name: (wifi ? await ssid() : null) ?? lan.name, address: lan.address }
      : null,
    busyPorts: ports.filter((_, i) => !free[i]),
    hasBattery: await hasBattery(),
  };
}
