// T071 · P-07 y P-08 en phone (ui-spec y maqueta T070).
import { VesselsView } from './Vessels.parts';
import type { VesselsModel } from './useVessels';

export function VesselsPhone({ model }: { model: VesselsModel }) {
  return <VesselsView model={model} device="phone" />;
}
