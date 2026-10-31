// T088 · P-15 Orden: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { OrderDesktop } from './Order.desktop';
import { OrderPhone } from './Order.phone';
import { OrderTablet } from './Order.tablet';
import { useOrder } from './useOrder';

const VIEWS = { phone: OrderPhone, tablet: OrderTablet, desktop: OrderDesktop };

export function OrderScreen() {
  const model = useOrder();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
