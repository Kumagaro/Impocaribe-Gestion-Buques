// T086 · P-13: la vista de Nueva orden, igual en las tres clases salvo los pasos de TEL (maqueta T085).
import type { DeviceClass } from '../../ui/device';
import { IssuedView, OrderFormView } from './OrderForm.parts';
import type { OrderFormModel } from './useOrderForm';

export interface NewOrderProps {
  model: OrderFormModel;
  share: () => void;
  savedAt: string | null;
  onCancel: () => void;
  onAnother: () => void;
  onOpen: () => void;
}

export function NewOrderView({ p, device }: { p: NewOrderProps; device: DeviceClass }) {
  if (p.model.issued) return <IssuedView m={p.model} onAnother={p.onAnother} onOpen={p.onOpen} />;
  return (
    <OrderFormView
      m={p.model}
      device={device}
      actions={{ onShare: p.share, onCancel: p.onCancel, savedAt: p.savedAt }}
    />
  );
}
