// T059 · P-20 Transportistas: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { CarriersDesktop } from './Carriers.desktop';
import { CarriersPhone } from './Carriers.phone';
import { CarriersTablet } from './Carriers.tablet';
import { useCarriers } from './useCarriers';

const VIEWS = { phone: CarriersPhone, tablet: CarriersTablet, desktop: CarriersDesktop };

export function CarriersScreen() {
  const model = useCarriers();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
