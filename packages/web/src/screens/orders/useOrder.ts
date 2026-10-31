// T088 y T089 · P-15 Orden y la anulación de P-16 (plan §7.3). RF-ORD-17 a 22, RF-BIT-04. La orden se lee de la copia
// local, con su documento congelado: se ve sin conexión. La descarga dice si sale el original o una copia (RF-ORD-21).
import { can, formatTons, parseTons } from '@impocaribe/shared';
import type {
  ClientDto,
  DeclarationDto,
  DriverDto,
  OrderDto,
  OrderVersionDto,
  TrailerDto,
  TruckDto,
} from '@impocaribe/shared/validation';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ordersApi } from '../../api/endpoints/orders';
import { useAppSession } from '../../session/SessionProvider';
import { useLocalList, useServerNow } from '../../sync/SyncProvider';
import { byText, useCatalog, useLocal } from '../catalogs/useCatalog';
import { dateText } from '../declarations/useDeclarations';

const DAY_MS = 86_400_000;

/** RF-ORD-20: qué cambió de una versión a la siguiente, en palabras. */
export function changesOf(
  prev: OrderVersionDto,
  next: OrderVersionDto,
  names: {
    truck: (id: string) => string;
    driver: (id: string) => string;
    recipient: (id: string) => string;
    trailer: (id: string) => string;
  },
): string[] {
  const out: string[] = [];
  const add = (label: string, a: string, b: string) => a !== b && out.push(`${label}: ${a || '—'} → ${b || '—'}`);
  const t = (s: string) => formatTons(parseTons(s));
  add('Toneladas', t(prev.tons), t(next.tons));
  add('Fecha de carga', dateText(prev.loadingDate), dateText(next.loadingDate));
  add('Carta de porte', prev.waybillNo, next.waybillNo);
  add('Destinatario', names.recipient(prev.recipientId), names.recipient(next.recipientId));
  add('Camión', names.truck(prev.truckId), names.truck(next.truckId));
  add('Chofer', names.driver(prev.driverId), names.driver(next.driverId));
  add('Remolques', prev.trailerIds.map(names.trailer).join(', '), next.trailerIds.map(names.trailer).join(', '));
  add('LOT', prev.lotNo ?? '', next.lotNo ?? '');
  add('Hoja de ruta', prev.routeSheetNo ?? '', next.routeSheetNo ?? '');
  add('Contenedor', prev.container ?? '', next.container ?? '');
  return out;
}

export function useCatalogNames() {
  const trucks = useLocal<TruckDto>(
    'truck',
    byText((t) => t.plate),
  );
  const drivers = useLocal<DriverDto>(
    'driver',
    byText((d) => d.fullName),
  );
  const trailers = useLocal<TrailerDto>(
    'trailer',
    byText((t) => t.plate),
  );
  const clients = useLocal<ClientDto>(
    'client',
    byText((c) => c.name),
  );
  return {
    truck: (id: string) => trucks.find((x) => x.id === id)?.plate ?? '',
    driver: (id: string) => drivers.find((x) => x.id === id)?.fullName ?? '',
    trailer: (id: string) => trailers.find((x) => x.id === id)?.plate ?? '',
    recipient: (id: string) => clients.flatMap((c) => c.recipients).find((r) => r.id === id)?.name ?? '',
  };
}

export function useOrder() {
  const base = useCatalog();
  const { session, state } = useAppSession();
  const now = useServerNow()();
  const navigate = useNavigate();
  const { id } = useParams();
  const { data: orders } = useLocalList<OrderDto>('order');
  const { data: declarations } = useLocalList<DeclarationDto>('declaration');
  const names = useCatalogNames();
  const [voiding, setVoiding] = useState(false);

  const order = orders?.find((o) => o.id === id) ?? null;
  const declaration = declarations?.find((d) => d.id === order?.declarationId) ?? null;
  const userId = state.session!.user.id;
  /** RF-ORD-21: quien emitió la versión vigente baja el original durante 24 horas; los demás, una copia. */
  const original =
    !!order && order.current.issuedById === userId && now.getTime() - Date.parse(order.current.issuedAt) < DAY_MS;

  return {
    ...base,
    loading: orders === undefined,
    order,
    declaration,
    canChange: can(state.session!.user.role, 'orders.issue') && order?.status === 'official',
    original,
    timeline: (order?.versions ?? [])
      .map((v, i, all) => ({
        version: v,
        current: v.versionNo === order!.current.versionNo,
        changes: i > 0 ? changesOf(all[i - 1]!, v, names) : [],
      }))
      .reverse(),
    download: () =>
      void base.act('descargar', async () => {
        const o = order!;
        const file = await base.api().request(ordersApi.pdf, { params: { id: o.id, n: String(o.current.versionNo) } });
        await session.saveFile(
          file.fileName,
          Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0)),
        );
        base.setNotice({
          tone: 'info',
          text:
            file.kind === 'original'
              ? `Se descargó el original de ${o.number}.`
              : `Se descargó una copia de ${o.number}.`,
        });
      }),
    correct: () => navigate(`/ordenes/${order!.id}/corregir`),
    voiding,
    askVoid: () => setVoiding(true),
    cancelVoid: () => setVoiding(false),
    /** RF-ORD-19: repone todo el saldo; el PDF queda con la marca ANULADA. */
    voidText: order
      ? `Se repondrán ${formatTons(parseTons(order.current.tons))} al saldo de la DM ${declaration?.number ?? ''}. El PDF queda archivado con la marca ANULADA y la orden no admite más versiones.`
      : '',
    void: (reason: string) =>
      void base.act('anular', async () => {
        const o = order!;
        await base.api().request(ordersApi.void, {
          params: { id: o.id },
          body: { reason, expectedVersion: o.current.versionNo },
        });
        setVoiding(false);
        await base.done(`Se anuló la orden ${o.number}.`);
      }),
  };
}

export type OrderModel = ReturnType<typeof useOrder>;
