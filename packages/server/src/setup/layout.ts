// T126 · plan §10.3 y §10.7: dónde queda cada cosa en la PC servidor y los archivos de configuración que escribe el
// ayudante: los ajustes de PostgreSQL para una PC de 4 GB, el servicio del servidor (WinSW) y las reglas del firewall
// solo para la red local (RF-RED-07). Todo puro: los pasos solo escriben lo que esto devuelve.
import { join } from 'node:path';
import { BROADCAST_PORT } from '@impocaribe/shared';

/** PostgreSQL propio en otro puerto que el habitual: no choca con uno que ya tuviera la PC. Solo escucha en la PC. */
export const PG_PORT = 5433;
export const SERVER_PORT = 8443;
export const MDNS_PORT = 5353;
export const DATABASE = 'impocaribe';
export const DB_USER = 'impocaribe';
/** Los servicios de Windows; el servidor los usa para detenerse al 5 % de batería (T132). */
export const SERVICES = { database: 'ImpocaribeBaseDatos', server: 'ImpocaribeServidor' } as const;

/** La conexión del servidor a su base, con la contraseña que generó la instalación. */
export const appDatabaseUrl = (password: string) =>
  `postgres://${DB_USER}:${encodeURIComponent(password)}@localhost:${PG_PORT}/${DATABASE}`;

export interface Layout {
  /** C:\Program Files\Impocaribe\Server: el programa (server-bundle), que se puede borrar y volver a copiar. */
  program: string;
  /** C:\ProgramData\Impocaribe: los datos, que sobreviven a reparar y actualizar. */
  data: string;
}

export function layout(env: NodeJS.ProcessEnv = process.env): Layout {
  return {
    program: join(env.ProgramFiles ?? 'C:\\Program Files', 'Impocaribe', 'Server'),
    data: join(env.ProgramData ?? 'C:\\ProgramData', 'Impocaribe'),
  };
}

export function paths(l: Layout) {
  return {
    node: join(l.program, 'node', 'node.exe'),
    pgBin: join(l.program, 'pgsql', 'bin'),
    chromium: join(l.program, 'chromium', 'chrome-headless-shell.exe'),
    serverMain: join(l.program, 'server', 'dist', 'main.js'),
    winsw: join(l.program, 'winsw', 'WinSW-x64.exe'),
    pgdata: join(l.data, 'pgdata'),
    dataDir: join(l.data, 'data'),
    identityDir: join(l.data, 'identity'),
    /** El servicio del servidor: su configuración lleva la contraseña de la base (carpeta solo para el sistema). */
    serviceDir: join(l.data, 'servicio'),
    logs: join(l.data, 'registros'),
  };
}

/** Plan §10.7: PostgreSQL en 400 MB como mucho, para una PC de 4 GB que además tiene la app abierta. */
export function postgresqlConf(): string {
  return [
    '# Órdenes de Carga (ayudante de instalación, plan §10.7)',
    "listen_addresses = 'localhost'",
    `port = ${PG_PORT}`,
    'max_connections = 20',
    'shared_buffers = 128MB',
    'work_mem = 4MB',
    'maintenance_work_mem = 64MB',
    'effective_cache_size = 512MB',
    "password_encryption = 'scram-sha-256'",
    "timezone = 'UTC'",
    '',
  ].join('\n');
}

const xml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * El servicio del servidor para WinSW: Node con el límite de memoria del plan §10.7, arranque automático, reinicio si
 * falla, después de la base de datos, y el entorno que lee config.ts.
 */
export function serviceXml(l: Layout, databaseUrl: string): string {
  const p = paths(l);
  const env: [string, string][] = [
    ['NODE_ENV', 'production'],
    ['PORT', String(SERVER_PORT)],
    ['DATABASE_URL', databaseUrl],
    ['IMPOCARIBE_DATA_DIR', p.dataDir],
    ['IMPOCARIBE_IDENTITY_DIR', p.identityDir],
    ['IMPOCARIBE_CHROMIUM', p.chromium],
    ['IMPOCARIBE_PG_BIN', p.pgBin],
    ['IMPOCARIBE_SERVICE', SERVICES.server],
    ['IMPOCARIBE_PG_SERVICE', SERVICES.database],
  ];
  return [
    '<service>',
    `  <id>${SERVICES.server}</id>`,
    '  <name>Órdenes de Carga · servidor</name>',
    '  <description>Atiende a las apps de Órdenes de Carga en la red local.</description>',
    `  <executable>${xml(p.node)}</executable>`,
    `  <arguments>--max-old-space-size=256 "${xml(p.serverMain)}"</arguments>`,
    `  <workingdirectory>${xml(join(l.program, 'server'))}</workingdirectory>`,
    '  <startmode>Automatic</startmode>',
    `  <depend>${SERVICES.database}</depend>`,
    '  <onfailure action="restart" delay="10 sec"/>',
    '  <onfailure action="restart" delay="30 sec"/>',
    '  <resetfailure>1 hour</resetfailure>',
    `  <logpath>${xml(p.logs)}</logpath>`,
    '  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log>',
    ...env.map(([name, value]) => `  <env name="${name}" value="${xml(value)}"/>`),
    '</service>',
    '',
  ].join('\n');
}

export interface FirewallRule {
  name: string;
  protocol: 'TCP' | 'UDP';
  port: number;
}

/** RF-RED-07: el servidor, la difusión de descubrimiento y el anuncio mDNS, solo desde la red local. */
export const FIREWALL_RULES: FirewallRule[] = [
  { name: 'Órdenes de Carga · servidor', protocol: 'TCP', port: SERVER_PORT },
  { name: 'Órdenes de Carga · descubrimiento', protocol: 'UDP', port: BROADCAST_PORT },
  { name: 'Órdenes de Carga · anuncio mDNS', protocol: 'UDP', port: MDNS_PORT },
];

/** Los argumentos de netsh para crear una regla: cualquier perfil de red (Windows puede marcarla pública), solo la subred local. */
export function firewallAdd(r: FirewallRule): string[] {
  return [
    'advfirewall',
    'firewall',
    'add',
    'rule',
    `name=${r.name}`,
    'dir=in',
    'action=allow',
    `protocol=${r.protocol}`,
    `localport=${r.port}`,
    'remoteip=localsubnet',
    'profile=any',
  ];
}
