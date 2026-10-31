// T054 · P-23 Configuración: la lógica y la presentación de la clase de dispositivo (plan §7.3). Sin conexión no hay
// datos que mostrar: la configuración solo se consulta en línea.
import { useDeviceClass } from '../../ui/device';
import { ErrorState, Skeleton } from '../../ui/presentation';
import { SettingsDesktop } from './Settings.desktop';
import { SettingsPhone } from './Settings.phone';
import { SettingsTablet } from './Settings.tablet';
import { useSettings } from './useSettings';

const VIEWS = { phone: SettingsPhone, tablet: SettingsTablet, desktop: SettingsDesktop };

export function SettingsScreen() {
  const model = useSettings();
  const View = VIEWS[useDeviceClass()];
  if (model.data.status === 'loading') return <Skeleton lines={8} />;
  if (model.data.status === 'error') return <ErrorState message={model.data.message} onRetry={model.reload} />;
  return <View model={model} />;
}
