// T059 · P-20 en desktop (ui-spec P-20 y maqueta T057).
import { CarriersView } from './Carriers.parts';
import type { CarriersModel } from './useCarriers';

export function CarriersDesktop({ model }: { model: CarriersModel }) {
  return <CarriersView model={model} device="desktop" />;
}
