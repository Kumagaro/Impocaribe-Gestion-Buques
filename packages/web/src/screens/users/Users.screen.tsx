// T040 · P-21 Usuarios: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { UsersDesktop } from './Users.desktop';
import { UsersPhone } from './Users.phone';
import { UsersTablet } from './Users.tablet';
import { useUsers } from './useUsers';

const VIEWS = { phone: UsersPhone, tablet: UsersTablet, desktop: UsersDesktop };

export function UsersScreen() {
  const model = useUsers();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
