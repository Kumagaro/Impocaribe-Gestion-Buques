// T114 · P-26 Versiones de la app: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { ReleasesDesktop } from './Releases.desktop';
import { ReleasesPhone } from './Releases.phone';
import { ReleasesTablet } from './Releases.tablet';
import { useReleases } from './useReleases';

const VIEWS = { phone: ReleasesPhone, tablet: ReleasesTablet, desktop: ReleasesDesktop };

export function ReleasesScreen() {
  const model = useReleases();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
