// T102 · P-32 Órdenes: filtros, cantidad y total del rango, tabla ordenable con la orden al lado (ESC), lista y orden
// lado a lado (TAB) y tarjetas por fecha de carga con los filtros en una hoja (TEL). Maqueta T099.
import { formatTons, parseTons } from '@impocaribe/shared';
import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Button, DateField, Select } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { Field } from '../../ui/form';
import { Sheet } from '../../ui/overlays';
import { Badge, EmptyState, ListCard, Notice, Skeleton } from '../../ui/presentation';
import { DataTable, type Column } from '../../ui/structure';
import type { OrderListModel, OrderRow, Period } from './useOrderList';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Esta semana' },
  { id: 'range', label: 'Rango' },
];
const t = (s: string) => formatTons(parseTons(s));
const date = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const DAY = new Intl.DateTimeFormat('es-CU', { weekday: 'long', timeZone: 'UTC' });
const dayTitle = (iso: string) => {
  const name = DAY.format(new Date(`${iso}T12:00:00Z`));
  return `${name[0]!.toUpperCase()}${name.slice(1)} ${date(iso)}/${iso.slice(0, 4)}`;
};

function Status({ r }: { r: OrderRow }) {
  return r.status === 'voided' ? <Badge tone="bad">Anulada</Badge> : <Badge tone="ok">Oficial</Badge>;
}

function Periods({ m }: { m: OrderListModel }) {
  return (
    <div className="al-chips" role="group" aria-label="Período">
      {PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          className="al-chip"
          aria-pressed={m.filters.period === p.id}
          onClick={() => m.set('period', p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function Filters({ m, periods = true }: { m: OrderListModel; periods?: boolean }) {
  const select = (
    id: string,
    label: string,
    key: Parameters<OrderListModel['set']>[0],
    options: { value: string; label: string }[],
  ) => (
    <Field id={id} label={label}>
      <Select id={id} options={options} value={String(m.filters[key])} onValueChange={(v) => m.set(key, v as never)} />
    </Field>
  );
  return (
    <div className="audit-filters">
      {periods && <Periods m={m} />}
      {m.filters.period === 'range' && (
        <>
          {select('ordenes-fecha', 'Fecha de', 'dateKind', [
            { value: 'loading', label: 'Carga' },
            { value: 'issue', label: 'Emisión' },
          ])}
          <Field id="ordenes-desde" label="Desde">
            <DateField id="ordenes-desde" value={m.filters.from} onValueChange={(v) => m.set('from', v)} />
          </Field>
          <Field id="ordenes-hasta" label="Hasta" error={m.rangeError}>
            <DateField
              id="ordenes-hasta"
              value={m.filters.to}
              onValueChange={(v) => m.set('to', v)}
              invalid={!!m.rangeError}
            />
          </Field>
        </>
      )}
      {select('ordenes-estado', 'Estado', 'status', m.options.status)}
      {select('ordenes-buque', 'Buque', 'vesselId', m.options.vessel)}
      {select('ordenes-dm', 'DM', 'declarationId', m.options.declaration)}
      {select('ordenes-cliente', 'Cliente', 'clientId', m.options.client)}
      {select('ordenes-transportista', 'Transportista', 'carrierId', m.options.carrier)}
      {select('ordenes-chofer', 'Chofer', 'driverId', m.options.driver)}
    </div>
  );
}

function Totals({ m }: { m: OrderListModel }) {
  const { count, tons, voided } = m.totals;
  return (
    <div className="order-totals" role="status" aria-label="Totales del rango">
      <b>{count}</b>
      <span>{count === 1 ? 'orden' : 'órdenes'}</span>
      <b>{tons}</b>
      {voided > 0 && <span>{`(${voided === 1 ? '1 anulada, que no suma' : `${voided} anuladas, que no suman`})`}</span>}
    </div>
  );
}

function Side({ m, r }: { m: OrderListModel; r: OrderRow | null }) {
  if (!r) return null;
  return (
    <aside className="order-panel" aria-label={`Orden ${r.number}`}>
      <b className="dm-num">{r.number}</b>
      <span>
        <Status r={r} /> {`versión ${r.versionNo}`}
      </span>
      <dl>
        <dt>DM</dt>
        <dd>{r.declarationNumber}</dd>
        <dt>Cliente</dt>
        <dd>{r.clientName}</dd>
        <dt>Carga</dt>
        <dd>{date(r.loadingDate)}</dd>
        <dt>Camión</dt>
        <dd>{r.truckPlate}</dd>
        <dt>Chofer</dt>
        <dd>{r.driverName}</dd>
        <dt>Toneladas</dt>
        <dd>{t(r.tons)}</dd>
      </dl>
      <div className="catalog-actions">
        <Button onClick={() => m.open(r)}>Abrir la orden</Button>
        <Button
          variant="ghost"
          onClick={() => m.download(r)}
          busy={m.busy === `descargar-${r.id}`}
          busyLabel="Descargando…"
          {...(m.offlineReason ? { disabledReason: m.offlineReason } : {})}
        >
          Descargar PDF
        </Button>
      </div>
    </aside>
  );
}

const COLUMNS: Column<OrderRow>[] = [
  {
    key: 'numero',
    header: 'Número',
    cell: (r) => <span className="dm-num">{r.number}</span>,
    sortable: true,
    sortValue: (r) => r.number,
  },
  { key: 'version', header: 'V.', cell: (r) => r.versionNo, sortable: true, sortValue: (r) => r.versionNo },
  { key: 'estado', header: 'Estado', cell: (r) => <Status r={r} />, sortable: true, sortValue: (r) => r.status },
  { key: 'carga', header: 'Carga', cell: (r) => date(r.loadingDate), sortable: true, sortValue: (r) => r.loadingDate },
  { key: 'dm', header: 'DM', cell: (r) => r.declarationNumber, sortable: true, sortValue: (r) => r.declarationNumber },
  { key: 'cliente', header: 'Cliente', cell: (r) => r.clientName, sortable: true, sortValue: (r) => r.clientName },
  {
    key: 'transportista',
    header: 'Transportista',
    cell: (r) => r.carrierName,
    sortable: true,
    sortValue: (r) => r.carrierName,
  },
  { key: 'chofer', header: 'Chofer', cell: (r) => r.driverName, sortable: true, sortValue: (r) => r.driverName },
  { key: 'camion', header: 'Camión', cell: (r) => r.truckPlate, sortable: true, sortValue: (r) => r.truckPlate },
  {
    key: 'toneladas',
    header: 'Toneladas',
    align: 'end',
    cell: (r) => (r.status === 'voided' ? <s>{t(r.tons)}</s> : t(r.tons)),
    sortable: true,
    sortValue: (r) => parseFloat(r.tons),
  },
];

function Card({ m, r, select }: { m: OrderListModel; r: OrderRow; select?: boolean }) {
  return (
    <div role="listitem" aria-label={r.number}>
      <ListCard
        title={r.number}
        aside={r.status === 'voided' ? <Status r={r} /> : <span className="dm-num">{t(r.tons)}</span>}
        selected={select ? m.selected?.id === r.id : false}
        changed={m.changed.has(r.id)}
        onOpen={() => (select ? m.select(r) : m.open(r))}
      >
        <span className="catalog-text">
          {`DM ${r.declarationNumber} · ${r.truckPlate} · ${r.driverName}${r.versionNo > 1 ? ` · versión ${r.versionNo}` : ''}`}
        </span>
      </ListCard>
    </div>
  );
}

function ByDay({ m }: { m: OrderListModel }) {
  const days = [...new Set(m.rows.map((r) => r.loadingDate))];
  return (
    <div className="order-form">
      {days.map((d) => (
        <section key={d} aria-label={dayTitle(d)} className="order-form" style={{ gap: 8 }}>
          <b className="order-day">{dayTitle(d)}</b>
          <div className="catalog-cards" role="list">
            {m.rows
              .filter((r) => r.loadingDate === d)
              .map((r) => (
                <Card key={r.id} m={m} r={r} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function OrderListView({ model: m, device }: { model: OrderListModel; device: DeviceClass }) {
  const [sheet, setSheet] = useState(false);
  if (m.loading) return <Skeleton lines={8} />;
  const empty = (
    <EmptyState
      title={
        m.filters.period === 'today' ? 'Hoy no hay órdenes con fecha de carga.' : 'No hay órdenes con estos filtros.'
      }
    />
  );
  const notice = m.notice && <Notice tone={m.notice.tone}>{m.notice.text}</Notice>;
  if (device === 'phone')
    return (
      <div className="audit-page">
        <div className="al-bar">
          <Periods m={m} />
          <Button
            variant="ghost"
            icon={<SlidersHorizontal size={18} aria-hidden="true" />}
            onClick={() => setSheet(true)}
          >
            Filtros
          </Button>
        </div>
        <Totals m={m} />
        {notice}
        {m.rows.length === 0 ? empty : <ByDay m={m} />}
        {sheet && (
          <Sheet title="Filtros" onClose={() => setSheet(false)}>
            <Filters m={m} periods={false} />
          </Sheet>
        )}
      </div>
    );
  return (
    <div className="audit-page">
      <Filters m={m} />
      <Totals m={m} />
      {notice}
      {m.rows.length === 0 ? (
        empty
      ) : device === 'tablet' ? (
        <div className="order-list-split">
          <div className="catalog-cards" role="list" aria-label="Órdenes">
            {m.rows.map((r) => (
              <Card key={r.id} m={m} r={r} select />
            ))}
          </div>
          <Side m={m} r={m.selected} />
        </div>
      ) : (
        <div className="order-grid">
          <DataTable caption="Órdenes" columns={COLUMNS} rows={m.rows} onRowClick={m.select} changed={m.changed} />
          <Side m={m} r={m.selected} />
        </div>
      )}
    </div>
  );
}
