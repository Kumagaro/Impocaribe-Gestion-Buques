// T102 · P-32 Órdenes: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { OrderListDesktop } from './OrderList.desktop';
import { OrderListPhone } from './OrderList.phone';
import { OrderListTablet } from './OrderList.tablet';
import { useOrderList } from './useOrderList';

const VIEWS = { phone: OrderListPhone, tablet: OrderListTablet, desktop: OrderListDesktop };

export function OrderListScreen() {
  const model = useOrderList();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
