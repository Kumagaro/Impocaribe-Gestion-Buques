// T102 · P-32 Órdenes (plan §7.3). RF-TAB-07, HU-17: todas las órdenes de la copia local (oficiales y anuladas, con su
// versión vigente), de la más reciente a la más antigua, con filtros y la cantidad y el total de toneladas del rango.
// «Hoy» viene activado. Sustituye al «Reporte por orden de carga» del Excel.
import { addDays, addTons, formatTons, havanaDate, parseTons, ZERO_TONS } from '@impocaribe/shared';
import type {
  CarrierDto,
  ClientDto,
  DeclarationDto,
  DriverDto,
  OrderDto,
  TruckDto,
  VesselDto,
} from '@impocaribe/shared/validation';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ordersApi } from '../../api/endpoints/orders';
import { useAppSession } from '../../session/SessionProvider';
import { useLocalList, useRecentlyChanged, useServerNow } from '../../sync/SyncProvider';
import { byText, useCatalog, useLocal } from '../catalogs/useCatalog';

export type Period = 'today' | 'week' | 'range';
export interface OrderListFilters {
  period: Period;
  /** En «Rango»: por fecha de carga o de emisión. */
  dateKind: 'loading' | 'issue';
  from: string;
  to: string;
  status: '' | 'official' | 'voided';
  vesselId: string;
  declarationId: string;
  clientId: string;
  carrierId: string;
  driverId: string;
}

export interface OrderRow {
  id: string;
  order: OrderDto;
  number: string;
  versionNo: number;
  status: OrderDto['status'];
  loadingDate: string;
  issueDate: string;
  declarationNumber: string;
  clientName: string;
  carrierName: string;
  driverName: string;
  truckPlate: string;
  tons: string;
}

/** Lunes a domingo de la semana de `today` (fechas de La Habana). */
export function weekOf(today: string): { from: string; to: string } {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const from = addDays(today, -weekday);
  return { from, to: addDays(from, 6) };
}

export function rowOf(o: OrderDto): OrderRow {
  const s = o.current.snapshot;
  return {
    id: o.id,
    order: o,
    number: o.number,
    versionNo: o.current.versionNo,
    status: o.status,
    loadingDate: o.current.loadingDate,
    issueDate: havanaDate(new Date(o.current.issuedAt)),
    declarationNumber: s.declarationNumber,
    clientName: s.clientName,
    carrierName: s.carrierName,
    driverName: s.driverName,
    truckPlate: s.truckPlate,
    tons: o.current.tons,
  };
}

/** La cantidad de órdenes del rango y sus toneladas; las anuladas se cuentan, pero no suman. */
export function totalsOf(rows: OrderRow[]) {
  const official = rows.filter((r) => r.status === 'official');
  return {
    count: rows.length,
    voided: rows.length - official.length,
    tons: formatTons(addTons(ZERO_TONS, ...official.map((r) => parseTons(r.tons)))),
  };
}

export function useOrderList() {
  const base = useCatalog();
  const { session } = useAppSession();
  const navigate = useNavigate();
  const today = havanaDate(useServerNow()());
  const { data } = useLocalList<OrderDto>('order');
  const changed = useRecentlyChanged('order');
  const vessels = useLocal<VesselDto>(
    'vessel',
    byText((v) => v.name),
  );
  const declarations = useLocal<DeclarationDto>(
    'declaration',
    byText((d) => d.number),
  );
  const clients = useLocal<ClientDto>(
    'client',
    byText((c) => c.name),
  );
  const carriers = useLocal<CarrierDto>(
    'carrier',
    byText((c) => c.name),
  );
  const drivers = useLocal<DriverDto>(
    'driver',
    byText((d) => d.fullName),
  );
  const trucks = useLocal<TruckDto>(
    'truck',
    byText((t) => t.plate),
  );
  const [f, setF] = useState<OrderListFilters>({
    period: 'today',
    dateKind: 'loading',
    from: '',
    to: '',
    status: '',
    vesselId: '',
    declarationId: '',
    clientId: '',
    carrierId: '',
    driverId: '',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const range =
    f.period === 'today'
      ? { from: today, to: today }
      : f.period === 'week'
        ? weekOf(today)
        : { from: f.from, to: f.to };
  const dateKey = f.period === 'range' && f.dateKind === 'issue' ? 'issueDate' : 'loadingDate';
  const clientOf = new Map(declarations.map((d) => [d.id, d.clientId]));
  const carrierOf = new Map(trucks.map((t) => [t.id, t.carrierId]));
  const rows = (data ?? [])
    .map(rowOf)
    .filter(
      (r) =>
        (!range.from || r[dateKey] >= range.from) &&
        (!range.to || r[dateKey] <= range.to) &&
        (!f.status || r.status === f.status) &&
        (!f.vesselId || r.order.vesselId === f.vesselId) &&
        (!f.declarationId || r.order.declarationId === f.declarationId) &&
        (!f.clientId || clientOf.get(r.order.declarationId) === f.clientId) &&
        (!f.carrierId || carrierOf.get(r.order.current.truckId) === f.carrierId) &&
        (!f.driverId || r.order.current.driverId === f.driverId),
    )
    .sort((a, b) => b.loadingDate.localeCompare(a.loadingDate) || b.number.localeCompare(a.number));
  const all = (label: string) => [{ value: '', label }];

  return {
    ...base,
    loading: data === undefined,
    today,
    filters: f,
    set: <K extends keyof OrderListFilters>(key: K, value: OrderListFilters[K]) =>
      setF((x) => ({ ...x, [key]: value })),
    rangeError:
      f.period === 'range' && f.from && f.to && f.from > f.to ? '«Hasta» no puede ser anterior a «desde».' : undefined,
    rows,
    totals: totalsOf(rows),
    changed,
    options: {
      status: [
        { value: '', label: 'Todas' },
        { value: 'official', label: 'Oficiales' },
        { value: 'voided', label: 'Anuladas' },
      ],
      vessel: [...all('Todos'), ...vessels.map((v) => ({ value: v.id, label: v.name }))],
      declaration: [...all('Todas'), ...declarations.map((d) => ({ value: d.id, label: d.number }))],
      client: [...all('Todos'), ...clients.map((c) => ({ value: c.id, label: c.name }))],
      carrier: [...all('Todos'), ...carriers.map((c) => ({ value: c.id, label: c.name }))],
      driver: [...all('Todos'), ...drivers.map((d) => ({ value: d.id, label: d.fullName }))],
    },
    selected: rows.find((r) => r.id === selectedId) ?? rows[0] ?? null,
    select: (r: OrderRow) => setSelectedId(r.id),
    open: (r: OrderRow) => navigate(`/ordenes/${r.id}`),
    /** RF-ORD-21: el original o una copia, según quién descarga y cuándo (lo decide el servidor). */
    download: (r: OrderRow) =>
      void base.act(`descargar-${r.id}`, async () => {
        const file = await base.api().request(ordersApi.pdf, { params: { id: r.id, n: String(r.versionNo) } });
        await session.saveFile(
          file.fileName,
          Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0)),
        );
        base.setNotice({
          tone: 'info',
          text:
            file.kind === 'original'
              ? `Se descargó el original de ${r.number}.`
              : `Se descargó una copia de ${r.number}.`,
        });
      }),
  };
}

export type OrderListModel = ReturnType<typeof useOrderList>;
