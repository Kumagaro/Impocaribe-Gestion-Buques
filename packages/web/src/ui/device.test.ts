import { describe, expect, it } from 'vitest';
import { deviceClassFor } from './device';

// T025 · RF-UI-02 y plan §7.3: la clase de dispositivo.
const android = (smallestWidthDp: number) => ({ platform: 'android' as const, appVersion: '1.0.0', smallestWidthDp });

describe('deviceClassFor', () => {
  it.each([
    [320, 'phone'],
    [599, 'phone'],
    [600, 'tablet'],
    [800, 'tablet'],
  ])('Android con ancho mínimo de %i dp → %s', (dp, cls) => {
    expect(deviceClassFor(android(dp))).toBe(cls);
  });

  it('Electron siempre es escritorio, aunque la ventana sea estrecha o se fuerce otra clase', () => {
    expect(deviceClassFor({ platform: 'windows', appVersion: '1.0.0', smallestWidthDp: 400 }, '?device=phone')).toBe(
      'desktop',
    );
  });

  it('Android no se deja forzar por parámetro', () => {
    expect(deviceClassFor(android(400), '?device=desktop')).toBe('phone');
  });

  it.each([
    ['?device=phone', 'phone'],
    ['?device=tablet', 'tablet'],
    ['?device=desktop', 'desktop'],
    ['?device=reloj', 'desktop'],
    ['', 'desktop'],
  ])('en el navegador de pruebas %s → %s', (search, cls) => {
    expect(deviceClassFor(null, search)).toBe(cls);
  });
});
