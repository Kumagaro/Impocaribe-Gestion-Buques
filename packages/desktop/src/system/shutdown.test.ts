import { describe, expect, it } from 'vitest';
import { ServerPcGuard, shutdownReason } from './shutdown.ts';

// T133 · RF-INS-09, RF-INS-10 y P-31: el motivo que muestra Windows al apagar la PC servidor, cuándo se bloquea el
// apagado y el inicio con la sesión de Windows. La llamada a user32 se verifica a mano en Windows 10 y 11 (T143).
function guard(configured = false) {
  const reasons: (string | null)[] = [];
  let enabled = 0;
  const g = new ServerPcGuard(
    { set: (r) => reasons.push(r), clear: () => reasons.push(null) },
    { configured: () => configured || enabled > 0, enable: () => void enabled++ },
  );
  return { g, reasons, enabled: () => enabled };
}

describe('aviso de apagado en la PC servidor', () => {
  it('el texto de RF-INS-09, en singular y en plural', () => {
    expect(shutdownReason(6)).toBe('Esta PC es el servidor de Órdenes de Carga: hay 6 dispositivos conectados');
    expect(shutdownReason(1)).toBe('Esta PC es el servidor de Órdenes de Carga: hay 1 dispositivo conectado');
    expect(shutdownReason(0)).toBe('Esta PC es el servidor de Órdenes de Carga: hay 0 dispositivos conectados');
  });

  it('en la PC servidor bloquea con el número al día; en otra PC no bloquea', () => {
    const { g, reasons } = guard();
    expect(g.shouldBlock()).toBe(false);
    g.update(6);
    g.update(7);
    expect(g.shouldBlock()).toBe(true);
    expect(reasons).toEqual([shutdownReason(6), shutdownReason(7)]);
    g.update(null);
    expect(g.shouldBlock()).toBe(false);
    expect(reasons.at(-1)).toBeNull();
  });

  it('la primera vez activa el inicio con Windows; si ya estaba decidido, no lo toca', () => {
    const first = guard();
    first.g.update(3);
    first.g.update(4);
    expect(first.enabled()).toBe(1);
    const decided = guard(true);
    decided.g.update(3);
    expect(decided.enabled()).toBe(0);
  });
});
