// T096 · P-17 Alertas: la lógica y la presentación de la clase de dispositivo (plan §7.3); y el panel lateral de
// escritorio que abre la campana.
import { useDeviceClass } from '../../ui/device';
import { AlertsDesktop } from './Alerts.desktop';
import { AlertsPanelView } from './Alerts.parts';
import { AlertsPhone } from './Alerts.phone';
import { AlertsTablet } from './Alerts.tablet';
import { useAlerts } from './useAlerts';

const VIEWS = { phone: AlertsPhone, tablet: AlertsTablet, desktop: AlertsDesktop };

export function AlertsScreen() {
  const model = useAlerts();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}

export function AlertsPanel({ onClose }: { onClose: () => void }) {
  return <AlertsPanelView model={useAlerts({ onLeave: onClose })} onClose={onClose} />;
}
