// T100 · P-06 Tablero: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { DashboardDesktop } from './Dashboard.desktop';
import { DashboardPhone } from './Dashboard.phone';
import { DashboardTablet } from './Dashboard.tablet';
import { useDashboard } from './useDashboard';

const VIEWS = { phone: DashboardPhone, tablet: DashboardTablet, desktop: DashboardDesktop };

export function DashboardScreen() {
  const model = useDashboard();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
