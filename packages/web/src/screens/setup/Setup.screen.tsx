// T038 · P-02 Primer arranque: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { SetupDesktop } from './Setup.desktop';
import { SetupPhone } from './Setup.phone';
import { SetupTablet } from './Setup.tablet';
import { useSetup } from './useSetup';

const VIEWS = { phone: SetupPhone, tablet: SetupTablet, desktop: SetupDesktop };

export function SetupScreen() {
  const model = useSetup();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
