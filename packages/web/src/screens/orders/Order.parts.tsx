// T088 · P-15 Orden: el documento A4 vigente y su línea de tiempo de versiones; acciones de descarga, corregir y anular
// (ui-spec y maqueta T085). En ESC, las versiones en el panel lateral; en TAB y TEL, debajo del documento.
import { Button } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { ReasonDialog } from '../../ui/overlays';
import { Badge, EmptyState, Notice, Skeleton } from '../../ui/presentation';
import { blocked } from '../catalogs/CatalogLayout';
import { DocumentPreview } from './DocumentPreview';
import type { OrderModel } from './useOrder';

const when = (iso: string) => {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('es-CU', {
    timeZone: 'America/Havana',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`;
};
const STATUS: Record<string, string> = { official: 'vigente', replaced: 'reemplazada', voided: 'anulada' };

function Timeline({ m }: { m: OrderModel }) {
  return (
    <section className="order-form" aria-label="Versiones">
      <b>Versiones</b>
      <ol className="order-timeline">
        {m.timeline.map(({ version: v, current, changes }) => (
          <li key={v.versionNo} {...(current ? { 'aria-current': 'step' as const } : {})}>
            <b>{`Versión ${v.versionNo} · ${STATUS[v.status]}`}</b>
            <br />
            <span className="catalog-text">{`${v.issuedByName ?? ''} · ${when(v.issuedAt)}`}</span>
            {changes.map((c) => (
              <span key={c} className="dm-row">
                <span className="order-changed">{c}</span>
              </span>
            ))}
            {v.reason && <span className="catalog-text">{` Motivo: ${v.reason}`}</span>}
            {v.capacityOverrideReason && (
              <span className="catalog-text">{` Excepción de capacidad: ${v.capacityOverrideReason}`}</span>
            )}
            {v.sameDayOverrideReason && (
              <span className="catalog-text">{` Excepción de camión repetido: ${v.sameDayOverrideReason}`}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function OrderView({ model: m, device }: { model: OrderModel; device: DeviceClass }) {
  if (m.loading) return <Skeleton lines={8} />;
  const o = m.order;
  if (!o) return <EmptyState title="La orden no está en este dispositivo." />;
  const voided = o.status === 'voided';
  const actions = (
    <div className="catalog-actions">
      <Button variant="secondary" onClick={m.download} busy={m.busy === 'descargar'} {...blocked(m.offlineReason)}>
        {m.original ? 'Descargar el original' : 'Descargar una copia'}
      </Button>
      {m.canChange && (
        <>
          <Button variant="secondary" onClick={m.correct} {...blocked(m.offlineReason)}>
            Corregir
          </Button>
          <Button variant="danger" onClick={m.askVoid} {...blocked(m.offlineReason)}>
            Anular
          </Button>
        </>
      )}
    </div>
  );
  const doc = (
    <div className="order-paper-wrap">
      <DocumentPreview s={o.current.snapshot} marks={voided ? ['ANULADA'] : []} />
    </div>
  );
  return (
    <div className="order-form">
      <div className="dm-row">
        <h2 className="catalog-title">{o.number}</h2>
        {voided ? <Badge tone="bad">Anulada</Badge> : <Badge tone="ok">Oficial</Badge>}
      </div>
      {m.notice && <Notice tone={m.notice.tone}>{m.notice.text}</Notice>}
      {actions}
      {device === 'desktop' ? (
        <div className="order-view">
          {doc}
          <Timeline m={m} />
        </div>
      ) : (
        <>
          {doc}
          <Timeline m={m} />
        </>
      )}
      {m.voiding && (
        <ReasonDialog
          title={`Anular ${o.number}`}
          description={m.voidText}
          confirmLabel="Anular"
          onConfirm={m.void}
          onClose={m.cancelVoid}
        />
      )}
    </div>
  );
}
