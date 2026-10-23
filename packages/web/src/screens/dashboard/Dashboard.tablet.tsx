// T100 · P-06 en tablet (ui-spec P-06 y maqueta T099).
import { DashboardView } from './Dashboard.parts';
import type { DashboardModel } from './useDashboard';

export function DashboardTablet({ model }: { model: DashboardModel }) {
  return <DashboardView model={model} device="tablet" />;
}
