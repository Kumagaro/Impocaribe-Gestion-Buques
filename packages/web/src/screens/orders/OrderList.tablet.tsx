// T102 · P-32 en tablet (ui-spec P-32 y maqueta T099).
import { OrderListView } from './OrderList.parts';
import type { OrderListModel } from './useOrderList';

export function OrderListTablet({ model }: { model: OrderListModel }) {
  return <OrderListView model={model} device="tablet" />;
}
