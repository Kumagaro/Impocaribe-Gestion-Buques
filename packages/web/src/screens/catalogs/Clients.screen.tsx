// T059 · P-19 Clientes: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { ClientsDesktop } from './Clients.desktop';
import { ClientsPhone } from './Clients.phone';
import { ClientsTablet } from './Clients.tablet';
import { useClients } from './useClients';

const VIEWS = { phone: ClientsPhone, tablet: ClientsTablet, desktop: ClientsDesktop };

export function ClientsScreen() {
  const model = useClients();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
