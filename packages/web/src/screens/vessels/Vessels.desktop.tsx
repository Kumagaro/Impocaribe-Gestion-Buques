// T071 · P-07 y P-08 en desktop (ui-spec y maqueta T070).
import { VesselsView } from './Vessels.parts';
import type { VesselsModel } from './useVessels';

export function VesselsDesktop({ model }: { model: VesselsModel }) {
  return <VesselsView model={model} device="desktop" />;
}
