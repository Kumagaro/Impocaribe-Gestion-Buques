// T088 · P-15 en tablet (ui-spec P-15 y maqueta T085).
import { OrderView } from './Order.parts';
import type { OrderModel } from './useOrder';

export function OrderTablet({ model }: { model: OrderModel }) {
  return <OrderView model={model} device="tablet" />;
}
