// T096 · P-17 en tablet (ui-spec P-17 y maqueta T095).
import { AlertsView } from './Alerts.parts';
import type { AlertsModel } from './useAlerts';

export function AlertsTablet({ model }: { model: AlertsModel }) {
  return <AlertsView model={model} device="tablet" />;
}
