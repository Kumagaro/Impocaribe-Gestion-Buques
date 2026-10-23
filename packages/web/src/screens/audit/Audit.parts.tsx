// T104 · P-25 Bitácora: filtros, tabla con el detalle desplegable (TAB y ESC) o tarjetas (TEL), y sin conexión, por qué
// no se ve (ui-spec P-25 y maqueta T099).
import type { AuditEntryDto } from '@impocaribe/shared/validation';
import { ChevronDown, CloudOff, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Button, DateField, Select, TextField } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { Field } from '../../ui/form';
import { Sheet } from '../../ui/overlays';
import { Badge, EmptyState, ErrorState, Skeleton } from '../../ui/presentation';
import type { AuditModel } from './useAudit';

const WHEN = new Intl.DateTimeFormat('es-CU', {
  timeZone: 'America/Havana',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const when = (iso: string) => WHEN.format(new Date(iso)).replace(',', '');

/** F-17. */
function Filters({ m }: { m: AuditModel }) {
  return (
    <div className="audit-filters">
      <Field id="bitacora-usuario" label="Usuario">
        <Select
          id="bitacora-usuario"
          options={m.userOptions}
          value={m.filters.userId}
          onValueChange={(v) => m.set('userId', v)}
        />
      </Field>
      <Field id="bitacora-desde" label="Desde" error={m.errors.from}>
        <DateField id="bitacora-desde" value={m.filters.from} onValueChange={(v) => m.set('from', v)} />
      </Field>
      <Field id="bitacora-hasta" label="Hasta" error={m.errors.to}>
        <DateField
          id="bitacora-hasta"
          value={m.filters.to}
          onValueChange={(v) => m.set('to', v)}
          invalid={!!m.errors.to}
          aria-describedby="bitacora-hasta-msg"
        />
      </Field>
      <Field id="bitacora-accion" label="Acción">
        <Select
          id="bitacora-accion"
          options={m.groupOptions}
          value={m.filters.group}
          onValueChange={(v) => m.set('group', v)}
        />
      </Field>
      <Field id="bitacora-ref" label="DM u orden" help="Número completo o su parte final" error={m.errors.ref}>
        <TextField id="bitacora-ref" value={m.typed} onValueChange={(v) => m.set('ref', v)} placeholder="0042" />
      </Field>
    </div>
  );
}

function Changes({ m, e }: { m: AuditModel; e: AuditEntryDto }) {
  const rows = m.changes(e);
  if (!e.ok) return <p className="audit-reject">{(e.after as { message?: string } | null)?.message ?? 'Rechazada.'}</p>;
  if (rows.length === 0 && !e.reason) return <p className="catalog-text">Sin datos que mostrar.</p>;
  return (
    <div className="audit-diff">
      {e.reason && <p>{`Motivo: ${e.reason}`}</p>}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">Dato</th>
              <th scope="col">Antes</th>
              <th scope="col">Después</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.field}>
                <td>{r.field}</td>
                <td>
                  <del>{r.before}</del>
                </td>
                <td>
                  <ins>{r.after}</ins>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Action({ m, e }: { m: AuditModel; e: AuditEntryDto }) {
  return (
    <span className="audit-action">
      {m.label(e)}
      {!e.ok && <Badge tone="bad">Rechazada</Badge>}
    </span>
  );
}

function Table({ m }: { m: AuditModel }) {
  return (
    <div className="ui-table-scroll">
      <table className="ui-table audit-table">
        <caption className="ui-visually-hidden">Bitácora</caption>
        <thead>
          <tr>
            <th scope="col">Fecha y hora</th>
            <th scope="col">Usuario</th>
            <th scope="col">Dispositivo</th>
            <th scope="col">Acción</th>
            <th scope="col">Entidad</th>
            <th scope="col">Detalle</th>
            <th scope="col">
              <span className="ui-visually-hidden">Ver</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {m.entries.map((e) => (
            <Row key={e.id} m={m} e={e} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ m, e }: { m: AuditModel; e: AuditEntryDto }) {
  const open = m.open === e.id;
  return (
    <>
      <tr aria-label={`${m.label(e)} ${when(e.at)}`}>
        <td className="audit-num">{when(e.at)}</td>
        <td>{e.userName ?? 'Sistema'}</td>
        <td>{e.deviceName ?? '—'}</td>
        <td>
          <Action m={m} e={e} />
        </td>
        <td className="audit-num">{e.entityLabel ?? '—'}</td>
        <td>{m.detail(e)}</td>
        <td>
          <button
            type="button"
            className="audit-toggle"
            aria-expanded={open}
            aria-label={open ? 'Ocultar el detalle' : 'Ver el detalle'}
            onClick={() => m.toggle(e.id)}
          >
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="audit-open" aria-label={`Detalle: ${m.label(e)}`}>
          <td colSpan={7}>
            <Changes m={m} e={e} />
          </td>
        </tr>
      )}
    </>
  );
}

function Cards({ m }: { m: AuditModel }) {
  return (
    <div className="catalog-cards" role="list" aria-label="Bitácora">
      {m.entries.map((e) => (
        <div key={e.id} role="listitem" className="audit-card" aria-label={`${m.label(e)} ${when(e.at)}`}>
          <button
            type="button"
            className="audit-card__head"
            aria-expanded={m.open === e.id}
            onClick={() => m.toggle(e.id)}
          >
            <Action m={m} e={e} />
            <span className="catalog-text">{when(e.at)}</span>
          </button>
          <span className="catalog-text">{`${e.userName ?? 'Sistema'} · ${e.deviceName ?? '—'}`}</span>
          {e.entityLabel && <span className="audit-num">{e.entityLabel}</span>}
          {m.detail(e) && <span className="catalog-text">{m.detail(e)}</span>}
          {m.open === e.id && <Changes m={m} e={e} />}
        </div>
      ))}
    </div>
  );
}

export function AuditView({ model: m, device }: { model: AuditModel; device: DeviceClass }) {
  const [sheet, setSheet] = useState(false);
  if (!m.online)
    return (
      <EmptyState
        icon={<CloudOff aria-hidden="true" />}
        title="La bitácora se consulta en el servidor."
        description="Sin conexión no se puede ver. Vuelva a intentarlo cuando el dispositivo se conecte."
      />
    );
  const list = m.loading ? (
    <Skeleton lines={8} />
  ) : m.failed ? (
    <ErrorState message="No se pudo leer la bitácora del servidor." onRetry={m.retry} />
  ) : m.entries.length === 0 ? (
    <EmptyState title="No hay registros con estos filtros." />
  ) : device === 'phone' ? (
    <Cards m={m} />
  ) : (
    <Table m={m} />
  );
  return (
    <div className="audit-page">
      {device === 'phone' ? (
        <div className="catalog-actions">
          <Button
            variant="ghost"
            icon={<SlidersHorizontal size={18} aria-hidden="true" />}
            onClick={() => setSheet(true)}
          >
            Filtros
          </Button>
          <Button variant="ghost" onClick={m.clear}>
            Quitar filtros
          </Button>
        </div>
      ) : (
        <Filters m={m} />
      )}
      {list}
      {m.more && (
        <div className="audit-more">
          <Button variant="ghost" onClick={m.loadMore} busy={m.loadingMore} busyLabel="Cargando…">
            Cargar más
          </Button>
        </div>
      )}
      {sheet && (
        <Sheet title="Filtros" onClose={() => setSheet(false)}>
          <Filters m={m} />
        </Sheet>
      )}
    </div>
  );
}
