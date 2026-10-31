// T058 · P-18 Choferes y camiones: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { FleetDesktop } from './Fleet.desktop';
import { FleetPhone } from './Fleet.phone';
import { FleetTablet } from './Fleet.tablet';
import { useFleet } from './useFleet';

const VIEWS = { phone: FleetPhone, tablet: FleetTablet, desktop: FleetDesktop };

export function FleetScreen() {
  const model = useFleet();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
