// T038 · P-01 Conexión y emparejamiento: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { ConnectionDesktop } from './Connection.desktop';
import { ConnectionPhone } from './Connection.phone';
import { ConnectionTablet } from './Connection.tablet';
import { useConnection } from './useConnection';

const VIEWS = { phone: ConnectionPhone, tablet: ConnectionTablet, desktop: ConnectionDesktop };

export function ConnectionScreen() {
  const model = useConnection();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
