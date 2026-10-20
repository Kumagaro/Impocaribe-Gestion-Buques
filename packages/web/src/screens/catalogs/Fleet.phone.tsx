// T058 · P-18 en phone (ui-spec P-18 y maqueta T057).
import { FleetView } from './Fleet.parts';
import type { FleetModel } from './useFleet';

export function FleetPhone({ model }: { model: FleetModel }) {
  return <FleetView model={model} device="phone" />;
}
