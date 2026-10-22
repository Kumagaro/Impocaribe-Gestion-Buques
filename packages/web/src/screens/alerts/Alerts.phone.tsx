// T096 · P-17 en phone (ui-spec P-17 y maqueta T095).
import { AlertsView } from './Alerts.parts';
import type { AlertsModel } from './useAlerts';

export function AlertsPhone({ model }: { model: AlertsModel }) {
  return <AlertsView model={model} device="phone" />;
}
