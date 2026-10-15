// T038 · P-03 Iniciar sesión: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { LoginDesktop } from './Login.desktop';
import { LoginPhone } from './Login.phone';
import { LoginTablet } from './Login.tablet';
import { useLogin } from './useLogin';

const VIEWS = { phone: LoginPhone, tablet: LoginTablet, desktop: LoginDesktop };

export function LoginScreen() {
  const model = useLogin();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
