// Utilidad de pruebas de componente: renderiza con la clase de dispositivo y la preferencia de movimiento indicadas.
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MotionProvider } from '../src/motion/MotionProvider';
import { DeviceClassProvider, type DeviceClass } from '../src/ui/device';

export function renderUi(
  ui: ReactElement,
  { device = 'desktop', reduceMotion = false, ...options }: { device?: DeviceClass; reduceMotion?: boolean } & RenderOptions = {},
): RenderResult {
  return render(
    <DeviceClassProvider value={device}>
      <MotionProvider reduceMotion={reduceMotion}>{ui}</MotionProvider>
    </DeviceClassProvider>,
    options,
  );
}
