// T102 · P-32 en phone (ui-spec P-32 y maqueta T099).
import { OrderListView } from './OrderList.parts';
import type { OrderListModel } from './useOrderList';

export function OrderListPhone({ model }: { model: OrderListModel }) {
  return <OrderListView model={model} device="phone" />;
}
