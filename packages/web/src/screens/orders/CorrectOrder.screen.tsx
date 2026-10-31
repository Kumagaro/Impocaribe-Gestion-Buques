// T089 · P-16 Corregir: el formulario de P-13 con la DM y el buque fijos, los cambios frente a la versión vigente y el
// motivo. Al emitir la versión nueva vuelve a la orden.
import type { OrderDto } from '@impocaribe/shared/validation';
import { useNavigate, useParams } from 'react-router';
import { useDeviceClass, type DeviceClass } from '../../ui/device';
import { EmptyState, Notice, Skeleton } from '../../ui/presentation';
import { useLocalList } from '../../sync/SyncProvider';
import { OrderFormView } from './OrderForm.parts';
import { changesOf, useCatalogNames } from './useOrder';
import { useOrderForm, type OrderFormModel } from './useOrderForm';

/** Lo que cambia frente a la versión vigente, en palabras (RF-ORD-20). */
export function pendingChanges(m: OrderFormModel, names: Parameters<typeof changesOf>[2]): string[] {
  const o = m.fixing!;
  const v = m.values;
  return changesOf(
    o.current,
    {
      ...o.current,
      // Mientras se escribe, unas toneladas a medias no se comparan.
      tons: /^\d+([.,]\d{1,3})?$/.test(String(v.tons ?? '')) ? String(v.tons).replace(',', '.') : o.current.tons,
      loadingDate: String(v.loadingDate ?? ''),
      waybillNo: String(v.waybillNo ?? '').toUpperCase(),
      recipientId: String(v.recipientId ?? ''),
      truckId: String(v.truckId ?? ''),
      driverId: String(v.driverId ?? ''),
      trailerIds: v.trailerIds ?? [],
      lotNo: String(v.lotNo ?? '') || null,
      routeSheetNo: String(v.routeSheetNo ?? '') || null,
      container: String(v.container ?? '').toUpperCase() || null,
    },
    names,
  );
}

export function CorrectOrderView({
  m,
  device,
  changes,
  onCancel,
}: {
  m: OrderFormModel;
  device: DeviceClass;
  changes: string[];
  onCancel: () => void;
}) {
  const o = m.fixing!;
  return (
    <div className="order-form">
      <h2 className="catalog-title">{`Corregir ${o.number}`}</h2>
      {changes.length > 0 && (
        <Notice tone="warn">{`Cambios frente a la versión ${o.current.versionNo}: ${changes.join(' · ')}`}</Notice>
      )}
      <OrderFormView m={m} device={device} actions={{ onCancel }} />
    </div>
  );
}

function Correct({ order }: { order: OrderDto }) {
  const navigate = useNavigate();
  const m = useOrderForm({ correcting: order, onDone: (o) => navigate(`/ordenes/${o.id}`) });
  const changes = pendingChanges(m, useCatalogNames());
  return (
    <CorrectOrderView
      m={m}
      device={useDeviceClass()}
      changes={changes}
      onCancel={() => navigate(`/ordenes/${order.id}`)}
    />
  );
}

export function CorrectOrderScreen() {
  const { id } = useParams();
  const { data } = useLocalList<OrderDto>('order');
  if (!data) return <Skeleton lines={8} />;
  const order = data.find((o) => o.id === id);
  if (!order) return <EmptyState title="La orden no está en este dispositivo." />;
  if (order.status === 'voided') return <EmptyState title="La orden está anulada: no admite más versiones." />;
  return <Correct order={order} />;
}
