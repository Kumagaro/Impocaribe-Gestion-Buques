// T100 · P-06 Tablero: filtro de buque, indicadores con cifras vivas (MOV-03), avance por DM y alertas de hoy; en ESC
// tabla ordenable y panel de alertas, en TAB la ficha de la DM con sus etapas, en TEL carrusel y tarjetas (maqueta T099).
import { formatTons, parseTons, STAGE_LABEL, STAGES, type Tons } from '@impocaribe/shared';
import { Plus } from 'lucide-react';
import { Button, Select } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { Field } from '../../ui/form';
import { Badge, EmptyState, ListCard, LiveNumber, ProgressBar, Skeleton, StatCard } from '../../ui/presentation';
import { DataTable, type Column } from '../../ui/structure';
import type { DashboardModel, DashboardRow } from './useDashboard';

const tons = (n: number) => formatTons(parseTons(n.toFixed(3)));
const tonsOf = (x: Tons | null) => (x === null ? '—' : formatTons(x));

function VesselFilter({ m }: { m: DashboardModel }) {
  return (
    <div className="dash-filter">
      <Field id="tablero-buque" label="Buque">
        <Select id="tablero-buque" options={m.vesselOptions} value={m.vesselId} onValueChange={m.setVesselId} />
      </Field>
    </div>
  );
}

function Stats({ m, className }: { m: DashboardModel; className: string }) {
  const s = m.stats;
  return (
    <div className={className} aria-label="Indicadores">
      <StatCard
        label="Contratado"
        value={<LiveNumber value={s.contractedTons} format={tons} />}
        note={`en ${s.dms} DM`}
      />
      <StatCard label="Extraído" value={<LiveNumber value={s.extractedTons} format={tons} />} />
      <StatCard label="Pendiente" value={<LiveNumber value={s.pendingTons} format={tons} />} note="por cargar" />
      <StatCard
        label="Órdenes"
        value={<LiveNumber value={s.official} format={(n) => String(Math.round(n))} />}
        note={[s.drafts === null ? null : `${s.drafts} borradores`, `${s.voided} anuladas`].filter(Boolean).join(' · ')}
      />
      <StatCard label="Requieren atención" value={s.attention} note="DM con alertas abiertas" />
    </div>
  );
}

function Stage({ r }: { r: DashboardRow }) {
  return <Badge tone={r.tone}>{r.stageText}</Badge>;
}

function Progress({ r }: { r: DashboardRow }) {
  return (
    <span className="dash-progress">
      <ProgressBar
        label={`Avance de la DM ${r.number}`}
        value={r.progress}
        tone={r.tone === 'bad' ? 'bad' : r.tone === 'warn' ? 'warn' : r.tone === 'ok' ? 'ok' : 'info'}
      />
      <span className="dm-num">{`${String(r.progress).replace('.', ',')} %`}</span>
    </span>
  );
}

const COLUMNS: Column<DashboardRow>[] = [
  {
    key: 'dm',
    header: 'DM',
    cell: (r) => <span className="dm-num">{r.number}</span>,
    sortable: true,
    sortValue: (r) => r.number,
  },
  {
    key: 'cliente',
    header: 'Cliente · marca',
    cell: (r) => r.clientBrand,
    sortable: true,
    sortValue: (r) => r.clientBrand,
  },
  {
    key: 'total',
    header: 'Total',
    align: 'end',
    cell: (r) => tonsOf(r.total),
    sortable: true,
    sortValue: (r) => r.total?.toNumber() ?? -1,
  },
  {
    key: 'cargado',
    header: 'Cargado',
    align: 'end',
    cell: (r) => tonsOf(r.loaded),
    sortable: true,
    sortValue: (r) => r.loaded.toNumber(),
  },
  {
    key: 'pendiente',
    header: 'Pendiente',
    align: 'end',
    cell: (r) => tonsOf(r.pending),
    sortable: true,
    sortValue: (r) => r.pending?.toNumber() ?? -1,
  },
  { key: 'avance', header: 'Avance', cell: (r) => <Progress r={r} />, sortable: true, sortValue: (r) => r.progress },
  {
    key: 'ordenes',
    header: 'Órdenes',
    align: 'end',
    cell: (r) => r.orders,
    sortable: true,
    sortValue: (r) => r.orders,
  },
  { key: 'etapa', header: 'Etapa', cell: (r) => <Stage r={r} />, sortable: true, sortValue: (r) => r.stageText },
];

/** RF-TAB-01: las alertas activas del día. */
function TodayAlerts({ m }: { m: DashboardModel }) {
  const a = m.alerts;
  const list = [...a.locals, ...a.server].slice(0, 6);
  return (
    <aside className="dash-alerts" aria-label="Alertas de hoy">
      <b>{`Alertas de hoy · ${a.open}`}</b>
      {list.length === 0 && <span className="catalog-text">No hay alertas abiertas.</span>}
      {list.map((x) => {
        const origin = a.origin(x);
        return (
          <div key={x.id} className="dash-alert">
            <span>{x.title}</span>
            <span className="catalog-text">
              {a.age(x)}
              {origin && (
                <>
                  {' · '}
                  <button type="button" className="al-link" onClick={origin.open}>
                    {origin.label}
                  </button>
                </>
              )}
            </span>
          </div>
        );
      })}
      <Button variant="ghost" onClick={a.seeAll}>
        Ver todas
      </Button>
    </aside>
  );
}

function Stages({ r }: { r: DashboardRow }) {
  const reached = STAGES.indexOf(r.stage);
  return (
    <ol className="dash-stages" aria-label="Etapas">
      {STAGES.map((s, i) => (
        <li
          key={s}
          data-state={i < reached ? 'done' : i === reached ? 'now' : 'next'}
          aria-current={i === reached ? 'step' : undefined}
        >
          {STAGE_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}

function Ficha({ m, r }: { m: DashboardModel; r: DashboardRow | null }) {
  if (!r) return null;
  return (
    <section className="order-panel" aria-label={`DM ${r.number}`}>
      <b>{`DM ${r.number} · ${r.clientBrand}`}</b>
      <Stages r={r} />
      <Stage r={r} />
      <dl>
        <dt>Total</dt>
        <dd>{tonsOf(r.total)}</dd>
        <dt>Cargado</dt>
        <dd>{tonsOf(r.loaded)}</dd>
        <dt>Pendiente</dt>
        <dd>{tonsOf(r.pending)}</dd>
        <dt>Órdenes</dt>
        <dd>{r.orders}</dd>
      </dl>
      <div className="catalog-actions">
        {m.newOrder && <Button onClick={() => m.newOrder!(r)}>Nueva orden para esta DM</Button>}
        <Button variant="ghost" onClick={() => m.openDeclaration(r)}>
          Abrir la DM
        </Button>
      </div>
    </section>
  );
}

function DmCard({ m, r, select }: { m: DashboardModel; r: DashboardRow; select?: boolean }) {
  return (
    <div role="listitem" aria-label={`DM ${r.number}`}>
      <ListCard
        title={r.number}
        aside={<Stage r={r} />}
        selected={select ? m.selected?.id === r.id : false}
        changed={m.changed.has(r.id)}
        onOpen={() => (select ? m.select(r) : m.openDeclaration(r))}
      >
        <span className="catalog-text">{r.clientBrand}</span>
        <Progress r={r} />
        <span className="catalog-text">{`Pendiente ${tonsOf(r.pending)} · ${r.orders} órdenes`}</span>
      </ListCard>
    </div>
  );
}

export function DashboardView({ model: m, device }: { model: DashboardModel; device: DeviceClass }) {
  if (m.loading) return <Skeleton lines={8} />;
  const empty = <EmptyState title={m.vesselId ? 'Este buque no tiene DM asignadas.' : 'Todavía no hay DM.'} />;
  if (device === 'phone')
    return (
      <div className="dash-page">
        <VesselFilter m={m} />
        <Stats m={m} className="dash-carousel" />
        <details className="dash-fold" open>
          <summary>{`Alertas de hoy · ${m.alerts.open}`}</summary>
          <TodayAlerts m={m} />
        </details>
        <b className="order-day">Avance por DM</b>
        {m.rows.length === 0 ? (
          empty
        ) : (
          <div className="catalog-cards" role="list" aria-label="Avance por DM">
            {m.rows.map((r) => (
              <DmCard key={r.id} m={m} r={r} />
            ))}
          </div>
        )}
      </div>
    );
  if (device === 'tablet')
    return (
      <div className="dash-page">
        <VesselFilter m={m} />
        <Stats m={m} className="dash-grid3" />
        {m.rows.length === 0 ? (
          empty
        ) : (
          <div className="order-list-split">
            <div className="catalog-cards" role="list" aria-label="Avance por DM">
              {m.rows.map((r) => (
                <DmCard key={r.id} m={m} r={r} select />
              ))}
            </div>
            <Ficha m={m} r={m.selected} />
          </div>
        )}
      </div>
    );
  return (
    <div className="dash-page">
      <div className="dash-top">
        <VesselFilter m={m} />
        {m.newOrder && (
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => m.newOrder!()}>
            Nueva orden
          </Button>
        )}
      </div>
      <Stats m={m} className="dash-strip" />
      <div className="order-grid">
        {m.rows.length === 0 ? (
          empty
        ) : (
          <DataTable
            caption="Avance por DM"
            columns={COLUMNS}
            rows={m.rows}
            onRowClick={m.openDeclaration}
            changed={m.changed}
          />
        )}
        <TodayAlerts m={m} />
      </div>
    </div>
  );
}
