// T071 · P-07 Buques y P-08 Ficha de buque: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { VesselsDesktop } from './Vessels.desktop';
import { VesselsPhone } from './Vessels.phone';
import { VesselsTablet } from './Vessels.tablet';
import { useVessels } from './useVessels';

const VIEWS = { phone: VesselsPhone, tablet: VesselsTablet, desktop: VesselsDesktop };

export function VesselsScreen() {
  const model = useVessels();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
