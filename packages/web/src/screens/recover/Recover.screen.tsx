// T038 · P-04 Recuperar contraseña: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { RecoverDesktop } from './Recover.desktop';
import { RecoverPhone } from './Recover.phone';
import { RecoverTablet } from './Recover.tablet';
import { useRecover } from './useRecover';

const VIEWS = { phone: RecoverPhone, tablet: RecoverTablet, desktop: RecoverDesktop };

export function RecoverScreen() {
  const model = useRecover();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
