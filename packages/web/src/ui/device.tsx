// Clase de dispositivo actual (RF-UI-02). T025 añade cómo se detecta; aquí solo se comparte con los componentes.
import { createContext, useContext, type ReactNode } from 'react';

export type DeviceClass = 'phone' | 'tablet' | 'desktop';

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
