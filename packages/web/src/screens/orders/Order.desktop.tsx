// T088 · P-15 en desktop (ui-spec P-15 y maqueta T085).
import { OrderView } from './Order.parts';
import type { OrderModel } from './useOrder';

export function OrderDesktop({ model }: { model: OrderModel }) {
  return <OrderView model={model} device="desktop" />;
}
