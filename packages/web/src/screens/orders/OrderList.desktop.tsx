// T102 · P-32 en desktop (ui-spec P-32 y maqueta T099).
import { OrderListView } from './OrderList.parts';
import type { OrderListModel } from './useOrderList';

export function OrderListDesktop({ model }: { model: OrderListModel }) {
  return <OrderListView model={model} device="desktop" />;
}
