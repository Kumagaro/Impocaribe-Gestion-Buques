// T133 · RF-INS-09, RF-INS-10 y P-31: en la PC servidor, al apagar o reiniciar Windows con la app abierta, Windows
// muestra el motivo: «Esta PC es el servidor de Órdenes de Carga: hay X dispositivos conectados», con «Apagar de todos
// modos». El texto lo fija ShutdownBlockReasonCreate (user32), que solo acepta la ventana del propio proceso: se llama
// desde aquí con koffi (FFI con binarios ya compilados, sin compilar nada). Y la app se inicia con la sesión de Windows.

/** El motivo que muestra Windows (RF-INS-09). */
export function shutdownReason(devices: number): string {
  return `Esta PC es el servidor de Órdenes de Carga: hay ${devices} ${devices === 1 ? 'dispositivo conectado' : 'dispositivos conectados'}`;
}

/** Fija o quita el motivo de la ventana (Windows lo muestra al bloquear el apagado). */
export interface ShutdownBlocker {
  set(reason: string): void;
  clear(): void;
}

/** user32.dll por koffi. `hwnd` es lo que da BrowserWindow.getNativeWindowHandle() (el puntero, en un Buffer). */
export async function windowsShutdownBlocker(hwnd: Buffer): Promise<ShutdownBlocker> {
  const { default: koffi } = await import('koffi');
  const user32 = koffi.load('user32.dll');
  const create = user32.func('bool __stdcall ShutdownBlockReasonCreate(uintptr_t hWnd, str16 pwszReason)');
  const destroy = user32.func('bool __stdcall ShutdownBlockReasonDestroy(uintptr_t hWnd)');
  const handle = hwnd.length >= 8 ? hwnd.readBigUInt64LE(0) : BigInt(hwnd.readUInt32LE(0));
  return {
    set: (reason) => void create(handle, reason),
    clear: () => void destroy(handle),
  };
}

/**
 * Lo que decide la app: la interfaz dice, cada poco, cuántos dispositivos hay conectados si esta PC es la servidor
 * (o null si no lo es). Con eso se fija el motivo, se bloquea el apagado y, la primera vez, se activa el inicio con
 * Windows; si alguien lo quita después desde la bandeja, se respeta.
 */
export class ServerPcGuard {
  private serverPc = false;

  constructor(
    private readonly blocker: ShutdownBlocker,
    private readonly autostart: { configured(): boolean; enable(): void },
  ) {}

  update(devices: number | null): void {
    if (devices === null) {
      this.serverPc = false;
      this.blocker.clear();
      return;
    }
    this.serverPc = true;
    this.blocker.set(shutdownReason(devices));
    if (!this.autostart.configured()) this.autostart.enable();
  }

  /** En 'query-session-end': true si hay que retrasar el apagado (Windows muestra el motivo). */
  shouldBlock(): boolean {
    return this.serverPc;
  }
}
