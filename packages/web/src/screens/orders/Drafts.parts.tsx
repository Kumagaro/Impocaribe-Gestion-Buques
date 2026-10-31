// T087 · P-14 Borradores: Míos y Compartidos, con el bloqueo visible (ui-spec y maqueta T085). En TEL, pestañas.
import { Lock, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { Dialog } from '../../ui/overlays';
import { Badge, EmptyState, ListCard, Notice, Skeleton } from '../../ui/presentation';
import { Tabs } from '../../ui/structure';
import { blocked } from '../catalogs/CatalogLayout';
import type { DraftRow, DraftsModel } from './useDrafts';

const WHERE = { device: 'Solo en este dispositivo', private: 'Privado', shared: 'Compartido' };
const when = (iso: string) =>
  new Intl.DateTimeFormat('es-CU', {
    timeZone: 'America/Havana',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

function Row({ m, r }: { m: DraftsModel; r: DraftRow }) {
  return (
    <div role="listitem">
      <ListCard
        title={m.title(r)}
        aside={
          r.where === 'device' ? (
            <Badge tone="mute">
              <Smartphone size={12} aria-hidden="true" /> {WHERE.device}
            </Badge>
          ) : (
            <Badge tone="info">{WHERE[r.where]}</Badge>
          )
        }
        onOpen={() => m.open(r)}
      >
        <span className="order-form" style={{ gap: 4 }}>
          <span>{m.detail(r)}</span>
          <span className="catalog-text">
            {`${r.ownerName ? `${r.ownerName} · ` : ''}editado ${when(r.updatedAt)}`}
          </span>
          {r.lockedByName && (
            <span className="dm-row catalog-text" style={{ justifyContent: 'flex-start' }}>
              <Lock size={12} aria-hidden="true" />
              {`En edición por ${r.lockedByName}`}
            </span>
          )}
        </span>
      </ListCard>
      <div className="catalog-actions" style={{ marginTop: 6 }}>
        {r.where !== 'shared' && (
          <Button
            variant="ghost"
            onClick={() => m.share(r)}
            busy={m.busy === `compartir-${r.id}`}
            {...blocked(m.offlineReason)}
          >
            Compartir
          </Button>
        )}
        {m.canRelease(r) && (
          <Button
            variant="ghost"
            onClick={() => m.release(r)}
            busy={m.busy === `liberar-${r.id}`}
            {...blocked(m.offlineReason)}
          >
            Liberar
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => m.askDiscard(r)}
          {...blocked(r.where === 'device' ? undefined : m.offlineReason)}
        >
          Descartar
        </Button>
      </div>
    </div>
  );
}

function List({ m, rows, label, empty }: { m: DraftsModel; rows: DraftRow[]; label: string; empty: string }) {
  return (
    <div className="catalog-cards" role="list" aria-label={label}>
      {rows.length === 0 && <EmptyState title={empty} />}
      {rows.map((r) => (
        <Row key={r.id} m={m} r={r} />
      ))}
    </div>
  );
}

export function DraftsView({ model: m, device }: { model: DraftsModel; device: DeviceClass }) {
  const [tab, setTab] = useState('mine');
  if (m.loading) return <Skeleton lines={6} />;
  const mine = <List m={m} rows={m.mine} label="Míos" empty="No tiene borradores." />;
  const shared = <List m={m} rows={m.shared} label="Compartidos" empty="No hay borradores compartidos." />;
  return (
    <div className="order-form">
      {m.notice && <Notice tone={m.notice.tone}>{m.notice.text}</Notice>}
      {device === 'phone' ? (
        <Tabs
          label="Borradores"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'mine', label: `Míos · ${m.mine.length}`, content: mine },
            { id: 'shared', label: `Compartidos · ${m.shared.length}`, content: shared },
          ]}
        />
      ) : (
        <div className="order-cols" style={{ alignItems: 'start' }}>
          <section className="order-form" aria-label="Mis borradores">
            <b>{`Míos · ${m.mine.length}`}</b>
            {mine}
          </section>
          <section className="order-form" aria-label="Borradores compartidos">
            <b>{`Compartidos · ${m.shared.length}`}</b>
            {shared}
          </section>
        </div>
      )}
      {m.confirm && (
        <Dialog
          title={`Descartar el borrador de ${m.title(m.confirm)}`}
          description="No reserva saldo ni tiene número: se pierde lo escrito."
          onClose={m.cancelDiscard}
          footer={
            <>
              <Button variant="ghost" onClick={m.cancelDiscard}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => m.discard(m.confirm!)}
                busy={m.busy === `descartar-${m.confirm.id}`}
                busyLabel="Descartando…"
              >
                Descartar
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}
