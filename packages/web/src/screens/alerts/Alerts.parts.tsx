// T096 · P-17 Alertas: la lista (las de este dispositivo arriba), los filtros, el detalle de tablet y el panel lateral
// de escritorio (ui-spec P-17 y maqueta T095).
import { ALERTS } from '@impocaribe/shared';
import { Check, CircleAlert, CloudOff, Inbox, Info, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, Select, TextField } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { Field } from '../../ui/form';
import { Panel, Sheet } from '../../ui/overlays';
import { Badge, EmptyState, Notice, Skeleton } from '../../ui/presentation';
import { blocked } from '../catalogs/CatalogLayout';
import type { AlertRow } from './useAlertFeed';
import { STATUS_FILTERS, type AlertsModel } from './useAlerts';

type Tone = 'bad' | 'warn' | 'info' | 'mute';
const BAD = new Set(['AL-04', 'AL-05', 'AL-12', 'AL-19', 'AL-20']);
const INFO = new Set(['AL-02', 'AL-10', 'AL-11']);

function toneOf(a: AlertRow): Tone {
  if (a.kind === 'local' || a.status !== 'open') return 'mute';
  return BAD.has(a.type) ? 'bad' : INFO.has(a.type) ? 'info' : 'warn';
}

function AlertIcon({ a }: { a: AlertRow }) {
  const tone = toneOf(a);
  const Icon =
    a.status !== 'open'
      ? Check
      : a.type === 'AL-13'
        ? CloudOff
        : a.type === 'AL-14'
          ? Inbox
          : tone === 'bad'
            ? CircleAlert
            : tone === 'info'
              ? Info
              : TriangleAlert;
  return (
    <span className="al-ico" data-tone={tone}>
      <Icon size={18} aria-hidden="true" />
    </span>
  );
}

const KIND: Record<AlertRow['kind'], { label: string; tone: 'bad' | 'warn' | 'info' | 'mute' }> = {
  event: { label: 'Evento', tone: 'info' },
  condition: { label: 'Se resuelve sola', tone: 'mute' },
  local: { label: 'Solo en este dispositivo', tone: 'mute' },
};

function stateText(a: AlertRow): string | null {
  if (a.status === 'attended') return `Atendida por ${a.attendedByName ?? 'otra persona'}`;
  if (a.status === 'resolved') return 'Resuelta';
  return null;
}

function AttendButton({ m, a }: { m: AlertsModel; a: AlertRow }) {
  if (!m.canAttend(a)) return null;
  return (
    <Button
      variant="ghost"
      onClick={() => m.attend(a)}
      busy={m.busy === `atender-${a.id}`}
      busyLabel="Atendiendo…"
      {...blocked(m.offlineReason)}
    >
      Atender
    </Button>
  );
}

export function AlertItem({
  m,
  a,
  compact = false,
  selected = false,
  onSelect,
}: {
  m: AlertsModel;
  a: AlertRow;
  compact?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const origin = m.origin(a);
  const state = stateText(a);
  const title = onSelect ? (
    <button type="button" className="al-item__open" onClick={onSelect} aria-current={selected || undefined}>
      {a.title}
    </button>
  ) : (
    <b>{a.title}</b>
  );
  return (
    <div
      role="listitem"
      className="al-item"
      data-selected={selected || undefined}
      data-changed={m.isNew(a) || undefined}
      aria-label={a.title}
    >
      <AlertIcon a={a} />
      <div className="al-item__main">
        {title}
        {!compact && <p>{a.detail}</p>}
        <div className="al-item__meta">
          {!compact && <Badge tone={KIND[a.kind].tone}>{KIND[a.kind].label}</Badge>}
          {compact && <span>{m.age(a)}</span>}
          {state && <span>{state}</span>}
          {origin && (
            <button type="button" className="al-link" onClick={origin.open}>
              {origin.label}
            </button>
          )}
        </div>
      </div>
      <div className="al-item__side">
        {!compact && <span>{a.kind === 'local' ? a.type : m.age(a)}</span>}
        <AttendButton m={m} a={a} />
      </div>
    </div>
  );
}

export function AlertList({
  m,
  compact = false,
  select = false,
}: {
  m: AlertsModel;
  compact?: boolean;
  /** Tablet: tocar una alerta muestra su detalle al lado. */
  select?: boolean;
}) {
  if (m.loading) return <Skeleton lines={5} />;
  if (m.locals.length + m.server.length === 0)
    return (
      <EmptyState title={m.status === 'open' ? 'No hay alertas abiertas.' : 'No hay alertas con estos filtros.'} />
    );
  const item = (a: AlertRow) => (
    <AlertItem
      key={a.id}
      m={m}
      a={a}
      compact={compact}
      selected={select && m.selected?.id === a.id}
      {...(select ? { onSelect: () => m.select(a) } : {})}
    />
  );
  return (
    <div className="al-list" role="list" aria-label="Alertas">
      {m.locals.length > 0 && <div className="al-group">En este dispositivo</div>}
      {m.locals.map(item)}
      {m.locals.length > 0 && m.server.length > 0 && <div className="al-group">Del servidor</div>}
      {m.server.map(item)}
    </div>
  );
}

function StatusChips({ m }: { m: AlertsModel }) {
  return (
    <div className="al-chips" role="group" aria-label="Estado">
      {STATUS_FILTERS.map((s) => (
        <button
          key={s.id}
          type="button"
          className="al-chip"
          aria-pressed={m.status === s.id}
          onClick={() => m.setStatus(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** F-17: estado, tipo y DM o buque. */
export function AlertFilters({ m }: { m: AlertsModel }) {
  return (
    <div className="al-filters">
      <StatusChips m={m} />
      <Field id="alertas-tipo" label="Tipo">
        <Select id="alertas-tipo" options={m.typeOptions} value={m.type} onValueChange={m.setType} />
      </Field>
      <Field id="alertas-ref" label="DM o buque">
        <TextField id="alertas-ref" value={m.text} onValueChange={m.setText} placeholder="00431, Eagle 1…" />
      </Field>
    </div>
  );
}

function AlertDetail({ m, a }: { m: AlertsModel; a: AlertRow | null }) {
  if (!a) return <EmptyState title="Elija una alerta para ver su detalle." />;
  const origin = m.origin(a);
  const state = stateText(a);
  return (
    <div className="al-detail">
      <span>
        <Badge tone={KIND[a.kind].tone}>{`${KIND[a.kind].label} · ${a.type}`}</Badge>
      </span>
      <h3>{a.title}</h3>
      <p>{a.detail}</p>
      <dl>
        <dt>Tipo</dt>
        <dd>{ALERTS[a.type].label}</dd>
        {a.createdAt && (
          <>
            <dt>Desde</dt>
            <dd>{m.age(a)}</dd>
          </>
        )}
        {state && (
          <>
            <dt>Estado</dt>
            <dd>{state}</dd>
          </>
        )}
      </dl>
      <div className="catalog-actions">
        {origin && <Button onClick={origin.open}>{origin.label}</Button>}
        <AttendButton m={m} a={a} />
      </div>
    </div>
  );
}

export function AlertsView({ model: m, device }: { model: AlertsModel; device: DeviceClass }) {
  const [filters, setFilters] = useState(false);
  const notice = m.notice && <Notice tone={m.notice.tone}>{m.notice.text}</Notice>;
  if (device === 'phone')
    return (
      <div className="al-page">
        <div className="al-bar">
          <StatusChips m={m} />
          <Button
            variant="ghost"
            icon={<SlidersHorizontal size={18} aria-hidden="true" />}
            onClick={() => setFilters(true)}
          >
            Filtros
          </Button>
        </div>
        {notice}
        <AlertList m={m} />
        {filters && (
          <Sheet title="Filtros" onClose={() => setFilters(false)}>
            <AlertFilters m={m} />
          </Sheet>
        )}
      </div>
    );
  if (device === 'tablet')
    return (
      <div className="al-page">
        <AlertFilters m={m} />
        {notice}
        <div className="al-split">
          <section aria-label="Lista de alertas">
            <AlertList m={m} compact select />
          </section>
          <section aria-label="Detalle de la alerta">
            <AlertDetail m={m} a={m.selected} />
          </section>
        </div>
      </div>
    );
  return (
    <div className="al-page">
      <AlertFilters m={m} />
      {notice}
      <AlertList m={m} />
    </div>
  );
}

/** ESC: el panel lateral que abre la campana en cualquier pantalla, con las abiertas. */
export function AlertsPanelView({ model: m, onClose }: { model: AlertsModel; onClose: () => void }): ReactNode {
  return (
    <Panel
      title={`Alertas abiertas · ${m.open}`}
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={m.seeAll}>
          Ver todas en Alertas
        </Button>
      }
    >
      {m.notice && <Notice tone={m.notice.tone}>{m.notice.text}</Notice>}
      <AlertList m={m} compact />
    </Panel>
  );
}
