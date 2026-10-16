// Clase de dispositivo (RF-UI-02, plan §7.3): se decide una vez al arrancar y se comparte con los componentes.
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { DeviceInfo } from '../platform/platform';

export type DeviceClass = 'phone' | 'tablet' | 'desktop';

/** Ancho mínimo de pantalla, en dp, a partir del cual Android es tablet. */
export const TABLET_MIN_DP = 600;

/**
 * Electron siempre es escritorio; Android es tablet desde 600 dp de ancho mínimo. Sin plataforma (navegador de pruebas),
 * se fuerza con `?device=phone|tablet|desktop`.
 */
export function deviceClassFor(info: DeviceInfo | null, search = ''): DeviceClass {
  if (info?.platform === 'windows') return 'desktop';
  if (info?.platform === 'android') return info.smallestWidthDp >= TABLET_MIN_DP ? 'tablet' : 'phone';
  const forced = new URLSearchParams(search).get('device');
  return forced === 'phone' || forced === 'tablet' ? forced : 'desktop';
}

const DeviceClassContext = createContext<DeviceClass>('desktop');

export function DeviceClassProvider({ value, children }: { value: DeviceClass; children: ReactNode }) {
  return <DeviceClassContext.Provider value={value}>{children}</DeviceClassContext.Provider>;
}

export function useDeviceClass(): DeviceClass {
  return useContext(DeviceClassContext);
}

/** Teléfono y tablet se usan con el dedo: objetivos táctiles de 48 dp (RNF-16). */
export function useTouch(): boolean {
  return useDeviceClass() !== 'desktop';
}

const PORTRAIT = '(orientation: portrait)';

/** Orientación actual: en tablet horizontal, lista y detalle van lado a lado (ui-spec §1.1). */
export function useOrientation(): 'portrait' | 'landscape' {
  return useSyncExternalStore(
    (onChange) => {
      const mq = matchMedia(PORTRAIT);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => (matchMedia(PORTRAIT).matches ? 'portrait' : 'landscape'),
  );
}
