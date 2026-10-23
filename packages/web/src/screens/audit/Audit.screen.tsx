// T104 · P-25 Bitácora: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { AuditDesktop } from './Audit.desktop';
import { AuditPhone } from './Audit.phone';
import { AuditTablet } from './Audit.tablet';
import { useAudit } from './useAudit';

const VIEWS = { phone: AuditPhone, tablet: AuditTablet, desktop: AuditDesktop };

export function AuditScreen() {
  const model = useAudit();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
