// T058 · P-18 en desktop (ui-spec P-18 y maqueta T057).
import { FleetView } from './Fleet.parts';
import type { FleetModel } from './useFleet';

export function FleetDesktop({ model }: { model: FleetModel }) {
  return <FleetView model={model} device="desktop" />;
}
