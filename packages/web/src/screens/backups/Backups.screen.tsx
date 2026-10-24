// T112 · P-24 Respaldos y restauración: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { BackupsDesktop } from './Backups.desktop';
import { BackupsPhone } from './Backups.phone';
import { BackupsTablet } from './Backups.tablet';
import { useBackups } from './useBackups';

const VIEWS = { phone: BackupsPhone, tablet: BackupsTablet, desktop: BackupsDesktop };

export function BackupsScreen() {
  const model = useBackups();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
