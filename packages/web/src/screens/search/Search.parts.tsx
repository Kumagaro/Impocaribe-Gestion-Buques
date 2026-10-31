// T101 · P-12 Buscar: el campo, los resultados agrupados por tipo, la ficha de la DM (RF-TAB-03, 04) con «Nueva orden
// para esta DM» y el seguimiento en PDF, y «Buscar en el archivo» con conexión (maqueta T099).
import { DEADLINE_DAYS, formatTons, parseTons, STAGE_LABEL, STAGES } from '@impocaribe/shared';
import type { OrderDto } from '@impocaribe/shared/validation';
import { ArrowLeft, CloudOff, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, TextField } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { Field } from '../../ui/form';
import { Badge, EmptyState, ListCard, Notice, Skeleton } from '../../ui/presentation';
import { blocked } from '../catalogs/CatalogLayout';
import type { Ficha, SearchModel } from './useSearch';

const t = (s: string | null) => (s === null ? '—' : formatTons(parseTons(s)));
const date = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const tone = (f: Ficha) =>
  f.stage.expired ? 'bad' : f.stage.stage === 'delivered' ? 'ok' : f.stage.stage === 'pending' ? 'mute' : 'info';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="search-group" aria-label={title}>
      <b className="order-day">{title}</b>
      <div className="catalog-cards" role="list">
        {children}
      </div>
    </section>
  );
}

function DmCard({ m, f }: { m: SearchModel; f: Ficha }) {
  const d = f.declaration;
  return (
    <div role="listitem" aria-label={`DM ${d.number}`}>
      <ListCard title={d.number} aside={<Badge tone={tone(f)}>{f.stageText}</Badge>} onOpen={() => m.open(f)}>
        <span className="catalog-text">
          {`${f.clientName} · ${d.brand} · saldo ${t(d.balanceTons)}${f.stage.stage === 'delivered' || f.stage.expired ? '' : ` · día ${Math.max(f.day, 1)}`}`}
        </span>
      </ListCard>
    </div>
  );
}

function OrderCard({ m, o, archived }: { m: SearchModel; o: OrderDto; archived?: boolean }) {
  const s = o.current.snapshot;
  const detail = `DM ${s.declarationNumber} · ${s.truckPlate} · ${t(o.current.tons)} · ${date(o.current.loadingDate)}`;
  const status = o.status === 'voided' ? <Badge tone="bad">Anulada</Badge> : <Badge tone="ok">Oficial</Badge>;
  if (archived)
    return (
      <div role="listitem" aria-label={o.number} className="search-archived">
        <span className="search-row">
          <b className="dm-num">{o.number}</b>
          {status}
        </span>
        <span className="catalog-text">{detail}</span>
        <Button
          variant="ghost"
          onClick={() => m.downloadOrder(o)}
          busy={m.busy === `pdf-${o.id}`}
          busyLabel="Descargando…"
          {...blocked(m.offlineReason)}
        >
          Descargar PDF
        </Button>
      </div>
    );
  return (
    <div role="listitem" aria-label={o.number}>
      <ListCard title={o.number} aside={status} onOpen={() => m.openOrder(o)}>
        <span className="catalog-text">{detail}</span>
      </ListCard>
    </div>
  );
}

function FichaView({ m, f }: { m: SearchModel; f: Ficha }) {
  const d = f.declaration;
  const reached = STAGES.indexOf(f.stage.stage);
  return (
    <section className="search-ficha" aria-label={`Ficha de la DM ${d.number}`}>
      <Button variant="ghost" icon={<ArrowLeft size={18} aria-hidden="true" />} onClick={m.back}>
        Volver a los resultados
      </Button>
      <h2 className="catalog-title">{`DM ${d.number} · ${f.clientName} · ${d.brand}`}</h2>
      {f.archived && <Notice tone="info">Del archivo: más de 12 meses, no está en este dispositivo.</Notice>}
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
      <Badge tone={tone(f)}>{f.stageText}</Badge>
      <dl className="search-kv">
        <dt>Total</dt>
        <dd>{t(d.totalTons)}</dd>
        <dt>Cargado</dt>
        <dd>{t(d.loadedTons)}</dd>
        <dt>Saldo</dt>
        <dd>{t(d.balanceTons)}</dd>
        <dt>Plazo</dt>
        <dd>
          {f.stage.expired
            ? 'Vencida'
            : f.stage.stage === 'delivered'
              ? 'Cerrada'
              : `día ${Math.max(f.day, 1)} de ${DEADLINE_DAYS}`}
        </dd>
      </dl>
      <b className="order-day">Asignaciones</b>
      {f.allocations.length === 0 ? (
        <span className="catalog-text">Sin asignaciones.</span>
      ) : (
        <ul className="search-list">
          {f.allocations.map((a) => (
            <li key={a.vesselName}>
              <b>{a.vesselName}</b>
              <span className="dm-num">{`asignado ${t(a.allocated)} · cargado ${t(a.loaded)} · saldo ${t(a.balance)}`}</span>
            </li>
          ))}
        </ul>
      )}
      {!f.archived && (
        <>
          <b className="order-day">{`Órdenes · ${f.orders.length}`}</b>
          <div className="catalog-cards" role="list" aria-label="Órdenes de la DM">
            {f.orders.map((o) => (
              <OrderCard key={o.id} m={m} o={o} />
            ))}
          </div>
        </>
      )}
      <div className="catalog-actions">
        {m.newOrder && !f.archived && <Button onClick={() => m.newOrder!(f)}>Nueva orden para esta DM</Button>}
        <Button
          variant="ghost"
          onClick={() => m.downloadTracking(f)}
          busy={m.busy === `seguimiento-${d.id}`}
          busyLabel="Generando…"
          {...blocked(m.offlineReason)}
        >
          Descargar el seguimiento (PDF)
        </Button>
      </div>
    </section>
  );
}

function Archive({ m }: { m: SearchModel }) {
  if (m.offlineReason)
    return (
      <div className="search-archive">
        <CloudOff size={18} aria-hidden="true" />
        Lo anterior a 12 meses está en el servidor: sin conexión no se puede buscar en el archivo.
      </div>
    );
  if (!m.archive)
    return (
      <div className="search-archive">
        <CloudOff size={18} aria-hidden="true" />
        Lo anterior a 12 meses no está en este dispositivo.
        <Button variant="ghost" onClick={m.searchArchive} busy={m.busy === 'archivo'} busyLabel="Buscando…">
          Buscar en el archivo
        </Button>
      </div>
    );
  const { declarations, orders } = m.archive;
  if (declarations.length + orders.length === 0)
    return <div className="search-archive">El archivo no tiene nada más con «{m.q}».</div>;
  return (
    <>
      {declarations.length > 0 && (
        <Group title={`DM del archivo · ${declarations.length}`}>
          {declarations.map((f) => (
            <DmCard key={f.declaration.id} m={m} f={f} />
          ))}
        </Group>
      )}
      {orders.length > 0 && (
        <Group title={`Órdenes del archivo · ${orders.length}`}>
          {orders.map((o) => (
            <OrderCard key={o.id} m={m} o={o} archived />
          ))}
        </Group>
      )}
    </>
  );
}

export function SearchView({ model: m }: { model: SearchModel; device: DeviceClass }) {
  if (m.loading) return <Skeleton lines={6} />;
  const found = m.declarations.length + m.orders.length + m.clients.length;
  return (
    <div className="search-page">
      <Field
        id="buscar"
        label="Buscar"
        help="Número de DM, cliente, marca o número de orden (completo o su parte final)"
      >
        <TextField
          id="buscar"
          type="search"
          value={m.q}
          onValueChange={m.setQ}
          placeholder="00431, Nuevos Tiempos, Dosel, 42…"
          autoFocus
        />
      </Field>
      {m.notice && <Notice tone={m.notice.tone}>{m.notice.text}</Notice>}
      {m.ficha ? (
        <FichaView m={m} f={m.ficha} />
      ) : !m.q.trim() ? (
        <EmptyState icon={<Search aria-hidden="true" />} title="Escriba qué buscar." />
      ) : (
        <>
          {found === 0 && <EmptyState title={`En este dispositivo no hay nada con «${m.q}».`} />}
          {m.declarations.length > 0 && (
            <Group title={`DM · ${m.declarations.length}`}>
              {m.declarations.map((f) => (
                <DmCard key={f.declaration.id} m={m} f={f} />
              ))}
            </Group>
          )}
          {m.orders.length > 0 && (
            <Group title={`Órdenes · ${m.orders.length}`}>
              {m.orders.map((o) => (
                <OrderCard key={o.id} m={m} o={o} />
              ))}
            </Group>
          )}
          {m.clients.length > 0 && (
            <Group title={`Clientes · ${m.clients.length}`}>
              {m.clients.map(({ client, count }) => (
                <div key={client.id} role="listitem" aria-label={client.name}>
                  <ListCard title={client.name} onOpen={() => m.showClient(client)}>
                    <span className="catalog-text">{count === 1 ? '1 DM' : `${count} DM`}</span>
                  </ListCard>
                </div>
              ))}
            </Group>
          )}
          <Archive m={m} />
        </>
      )}
    </div>
  );
}
