// T086 · P-13 en phone (ui-spec P-13 y maqueta T085).
import { NewOrderView, type NewOrderProps } from './NewOrder.parts';

export function NewOrderPhone({ p }: { p: NewOrderProps }) {
  return <NewOrderView p={p} device="phone" />;
}
