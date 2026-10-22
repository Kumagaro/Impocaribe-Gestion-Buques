// T087 · P-14 Borradores: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { DraftsDesktop } from './Drafts.desktop';
import { DraftsPhone } from './Drafts.phone';
import { DraftsTablet } from './Drafts.tablet';
import { useDrafts } from './useDrafts';

const VIEWS = { phone: DraftsPhone, tablet: DraftsTablet, desktop: DraftsDesktop };

export function DraftsScreen() {
  const model = useDrafts();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
