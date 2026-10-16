// T039 · P-05 Perfil: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { ProfileDesktop } from './Profile.desktop';
import { ProfilePhone } from './Profile.phone';
import { ProfileTablet } from './Profile.tablet';
import { useProfile } from './useProfile';

const VIEWS = { phone: ProfilePhone, tablet: ProfileTablet, desktop: ProfileDesktop };

export function ProfileScreen() {
  const model = useProfile();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
