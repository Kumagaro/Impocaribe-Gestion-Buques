// T059 · P-20 en tablet (ui-spec P-20 y maqueta T057).
import { CarriersView } from './Carriers.parts';
import type { CarriersModel } from './useCarriers';

export function CarriersTablet({ model }: { model: CarriersModel }) {
  return <CarriersView model={model} device="tablet" />;
}
