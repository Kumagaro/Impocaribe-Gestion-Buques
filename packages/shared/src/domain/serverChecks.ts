// T126 y T127 · RF-INS-03.1-2 y RNF-19: la comprobación de la PC que será el servidor (paso 1 de P-28 y paso 0 del
// ayudante, con el mismo criterio). Verde: cumple. Ámbar: funciona con un aviso. Rojo: no deja continuar.

export type CheckLevel = 'ok' | 'warn' | 'bad';

export interface ServerCheck {
  id: 'server' | 'windows' | 'memory' | 'disk' | 'network' | 'ports' | 'power';
  level: CheckLevel;
  title: string;
  detail: string;
}

export interface PcFacts {
  /** Un servidor de Órdenes de Carga que ya responde en la red (nombre y dirección), o null. */
  existingServer: { name: string; address: string } | null;
  /** Número de compilación de Windows (Windows 10 desde 10240, Windows 11 desde 22000) y si es de 64 bits. */
  windowsBuild: number;
  is64bit: boolean;
  memoryBytes: number;
  /** Libres en la unidad del sistema (C:). */
  freeDiskBytes: number;
  /** La red por la que se conectan los dispositivos, o null si no hay ninguna. */
  network: { kind: 'wifi' | 'cable'; name: string; address: string } | null;
  /** Los puertos que el servidor necesita y que ya usa otro programa. */
  busyPorts: number[];
  /** Laptop con batería (o UPS por USB): en un apagón el servidor se protege solo (RF-ENE). */
  hasBattery: boolean;
}

const GB = 1024 ** 3;
/** RNF-19. */
export const MIN_MEMORY_GB = 4;
export const RECOMMENDED_MEMORY_GB = 8;
export const MIN_FREE_DISK_GB = 20;

/** Lo que muestra Windows como memoria: 3,9 GB en una PC de 4 se cuenta como 4. */
const roundGb = (bytes: number) => Math.round(bytes / GB);

export function checkServerPc(f: PcFacts): ServerCheck[] {
  const memory = roundGb(f.memoryBytes);
  const disk = Math.floor(f.freeDiskBytes / GB);
  const windows = f.windowsBuild >= 22000 ? 'Windows 11' : 'Windows 10';
  return [
    f.existingServer
      ? {
          id: 'server',
          level: 'bad',
          title: `Ya hay un servidor en esta red: ${f.existingServer.name}`,
          detail:
            `Está en ${f.existingServer.address}. Solo puede haber uno. Para pasarlo a esta PC, use «Preparar ` +
            'traslado» en Estado del servidor de esa PC y después «Crear servidor desde un respaldo de traslado» aquí.',
        }
      : {
          id: 'server',
          level: 'ok',
          title: 'No hay otro servidor en la red',
          detail: 'Se buscó durante 15 s por todos los métodos.',
        },
    f.windowsBuild >= 10240 && f.is64bit
      ? { id: 'windows', level: 'ok', title: `${windows} de 64 bits`, detail: 'Windows 10 u 11 de 64 bits.' }
      : {
          id: 'windows',
          level: 'bad',
          title: f.is64bit ? 'Esta versión de Windows es anterior a Windows 10' : 'Windows de 32 bits',
          detail: 'El servidor necesita Windows 10 u 11 de 64 bits.',
        },
    memory >= RECOMMENDED_MEMORY_GB
      ? {
          id: 'memory',
          level: 'ok',
          title: `Memoria: ${memory} GB`,
          detail: `Se recomiendan ${RECOMMENDED_MEMORY_GB} GB.`,
        }
      : memory >= MIN_MEMORY_GB
        ? {
            id: 'memory',
            level: 'warn',
            title: `Memoria: ${memory} GB`,
            detail: `Funcionará, aunque más lento; se recomiendan ${RECOMMENDED_MEMORY_GB} GB.`,
          }
        : {
            id: 'memory',
            level: 'bad',
            title: `Memoria: ${memory} GB`,
            detail: `Hacen falta al menos ${MIN_MEMORY_GB} GB; se recomiendan ${RECOMMENDED_MEMORY_GB} GB.`,
          },
    disk >= MIN_FREE_DISK_GB
      ? {
          id: 'disk',
          level: 'ok',
          title: `Disco: ${disk} GB libres en C:`,
          detail: `Hacen falta ${MIN_FREE_DISK_GB} GB.`,
        }
      : {
          id: 'disk',
          level: 'bad',
          title: `Disco: ${disk} GB libres en C:`,
          detail: `Hacen falta ${MIN_FREE_DISK_GB} GB libres: libere espacio y vuelva a comprobar.`,
        },
    f.network
      ? {
          id: 'network',
          level: 'ok',
          title: `Red: conectada por ${f.network.kind === 'wifi' ? 'wifi' : 'cable'}`,
          detail: `«${f.network.name}» · dirección ${f.network.address}`,
        }
      : {
          id: 'network',
          level: 'bad',
          title: 'Sin red',
          detail: 'Conecte esta PC al wifi (o al router por cable) donde estarán los dispositivos.',
        },
    f.busyPorts.length === 0
      ? {
          id: 'ports',
          level: 'ok',
          title: 'Puertos del servidor libres',
          detail: 'Nada más en esta PC usa los puertos que necesita.',
        }
      : {
          id: 'ports',
          level: 'bad',
          title: `Puerto ${f.busyPorts.join(', ')} en uso`,
          detail: 'Otro programa usa un puerto que necesita el servidor. Ciérrelo o pida ayuda a quien dio soporte.',
        },
    f.hasBattery
      ? {
          id: 'power',
          level: 'ok',
          title: 'Laptop con batería',
          detail: 'En un apagón el servidor sigue y se protege solo.',
        }
      : {
          id: 'power',
          level: 'warn',
          title: 'Sin batería',
          detail: 'En un apagón el servidor se apaga de golpe. Se recomienda un UPS conectado por USB.',
        },
  ];
}

/** Rojo no deja continuar; ámbar sí. */
export const canCreateServer = (checks: ServerCheck[]) => checks.every((c) => c.level !== 'bad');
