import { describe, expect, it } from 'vitest';
import { powerMode, powerNotice } from './power.ts';

// T132 · RF-ENE-02 a 05: los límites 15,0 % y 15,1 % se comportan como dicen los requisitos («al 15 % o menos»).
describe('energía del servidor', () => {
  it('con corriente es normal, sea cual sea la carga', () => {
    expect(powerMode({ onBattery: false, percent: 3 })).toBe('mains');
    expect(powerNotice({ onBattery: false, percent: 3 })).toBeNull();
  });

  it('con batería por encima del 15 %, solo avisa', () => {
    expect(powerMode({ onBattery: true, percent: 15.1 })).toBe('battery');
    expect(powerMode({ onBattery: true, percent: 100 })).toBe('battery');
    expect(powerNotice({ onBattery: true, percent: 62 })).toBe('El servidor funciona con batería (62 %)');
  });

  it('al 15 % o menos, modo protegido; al 5 % o menos, se detiene', () => {
    expect(powerMode({ onBattery: true, percent: 15 })).toBe('protected');
    expect(powerMode({ onBattery: true, percent: 5.1 })).toBe('protected');
    expect(powerMode({ onBattery: true, percent: 5 })).toBe('stop');
    expect(powerNotice({ onBattery: true, percent: 14 })).toBe(
      'Servidor en modo protegido por batería baja: solo consulta',
    );
  });

  it('con batería sin porcentaje conocido, avisa sin proteger', () => {
    expect(powerMode({ onBattery: true, percent: null })).toBe('battery');
    expect(powerNotice({ onBattery: true, percent: null })).toBe('El servidor funciona con batería');
  });
});
