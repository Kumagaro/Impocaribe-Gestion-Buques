// T059 · P-20 en phone (ui-spec P-20 y maqueta T057).
import { CarriersView } from './Carriers.parts';
import type { CarriersModel } from './useCarriers';

export function CarriersPhone({ model }: { model: CarriersModel }) {
  return <CarriersView model={model} device="phone" />;
}
