// T071 · P-07 Buques y P-08 Ficha de buque: lista con saldos, ficha con pestañas (Resumen, DM, Sobrante, Historial),
// alta y edición, arribo real, asignación, destinos del sobrante y cierre (ui-spec y maqueta T070).
import { SURPLUS_KIND_LABEL, type VesselDto } from '@impocaribe/shared/validation';
import { Lock } from 'lucide-react';
import { Button, TextField, TonsInput } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { ErrorSummary, Field, UnsavedChangesGuard } from '../../ui/form';
import { Dialog, OverrideDialog } from '../../ui/overlays';
import { Badge, EmptyState, ListCard, Notice } from '../../ui/presentation';
import { DataTable, Tabs } from '../../ui/structure';
import { blocked, CatalogLayout } from '../catalogs/CatalogLayout';
import { selectOf } from '../catalogs/Fleet.parts';
import { dateText, tonsText } from '../declarations/useDeclarations';
import { vesselLabel, type VesselsModel, type VesselTab } from './useVessels';

const StatusBadge = ({ v }: { v: VesselDto }) =>
  v.status === 'open' ? <Badge tone="ok">Abierto</Badge> : <Badge tone="mute">Cerrado</Badge>;

const arrivalText = (v: VesselDto) =>
  v.arrivalDate ? dateText(v.arrivalDate) : v.etaDate ? `est. ${dateText(v.etaDate)}` : 'Sin fecha';

function Summary({ m, v }: { m: VesselsModel; v: VesselDto }) {
  const open = v.status === 'open';
  return (
    <div className="catalog-form">
      {v.status === 'closed' && v.unresolvedSurplusTons !== '0.000' && (
        <Notice tone="warn">{`El buque está cerrado y tiene ${tonsText(v.unresolvedSurplusTons)} de sobrante nuevo sin destino.`}</Notice>
      )}
      <dl className="dm-kv">
        <dt>Código</dt>
        <dd className="dm-num">{v.code}</dd>
        <dt>Manifiesto</dt>
        <dd>{v.manifest}</dd>
        <dt>B/L</dt>
        <dd>{v.bl}</dd>
        <dt>Puerto y terminal</dt>
        <dd>{v.port}</dd>
        <dt>Comprador interno</dt>
        <dd>{v.internalBuyer}</dd>
        <dt>Arribo estimado</dt>
        <dd>{v.etaDate ? dateText(v.etaDate) : '—'}</dd>
        <dt>Arribo real</dt>
        <dd>
          {v.arrivalDate ? `${dateText(v.arrivalDate)} · viaje V${v.voyageNo}` : 'Aún no llega: no admite órdenes'}
          {m.arrivalLocked && (
            <span className="dm-row catalog-text">
              <Lock size={14} aria-hidden="true" />
              {m.arrivalLocked}
            </span>
          )}
        </dd>
        <dt>Total</dt>
        <dd className="dm-num">{tonsText(v.totalTons)}</dd>
        <dt>Asignado</dt>
        <dd className="dm-num">{tonsText(v.allocatedTons)}</dd>
        <dt>Libre</dt>
        <dd className="dm-num">{tonsText(v.freeTons)}</dd>
        <dt>Cargado</dt>
        <dd className="dm-num">{tonsText(v.loadedTons)}</dd>
        <dt>Restante</dt>
        <dd className="dm-num">{tonsText(v.remainingTons)}</dd>
      </dl>
      {m.canEdit && (
        <div className="catalog-actions">
          <Button variant="secondary" onClick={m.openEdit} {...blocked(m.offlineReason)}>
            Editar
          </Button>
          <Button
            variant="secondary"
            onClick={m.openArrival}
            {...blocked(m.offlineReason ?? (v.arrivalDate ? m.arrivalLocked : undefined))}
          >
            {v.arrivalDate ? 'Corregir el arribo' : 'Registrar el arribo'}
          </Button>
          <Button variant="secondary" onClick={m.openAssign} {...blocked(m.offlineReason ?? m.closedReason)}>
            Asignar DM
          </Button>
          {open && (
            <Button onClick={m.askClose} {...blocked(m.offlineReason ?? m.closeBlocked)}>
              Cerrar el buque
            </Button>
          )}
        </div>
      )}
      {open && m.closeBlocked && <p className="catalog-text">{m.closeBlocked}</p>}
    </div>
  );
}

function Declarations({ m, v }: { m: VesselsModel; v: VesselDto }) {
  const rows = m.declarationsOf(v);
  if (rows.length === 0) return <p className="catalog-text">Aún no tiene DM asignadas.</p>;
  return (
    <ul className="catalog-cards" aria-label="DM asignadas" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {rows.map(({ declaration: d, allocation: a }) => (
        <li key={a.id} className="dm-row">
          <span>{`${d.number} · ${m.clientName(d.clientId)}`}</span>
          <span className="dm-num">{`${tonsText(a.allocatedTons)} · saldo ${tonsText(a.balanceTons)}`}</span>
        </li>
      ))}
    </ul>
  );
}

function Surplus({ m, v }: { m: VesselsModel; v: VesselDto }) {
  const s = m.surplus;
  return (
    <div className="catalog-form">
      <dl className="dm-kv">
        <dt>Sobrante</dt>
        <dd className="dm-num">{tonsText(v.surplusTons)}</dd>
        <dt>Sin destino</dt>
        <dd className="dm-num">{tonsText(v.unresolvedSurplusTons)}</dd>
      </dl>
      {m.offlineReason ? (
        <Notice tone="info">Los destinos registrados se consultan con conexión al servidor.</Notice>
      ) : s === 'error' ? (
        <Notice tone="bad">No se pudieron cargar los destinos. Inténtelo de nuevo.</Notice>
      ) : s === 'loading' || s === null ? (
        <p className="catalog-text">Cargando los destinos…</p>
      ) : s.dispositions.length === 0 ? (
        <p className="catalog-text">Aún no tiene destinos registrados.</p>
      ) : (
        <ul className="catalog-cards" aria-label="Destinos" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {s.dispositions.map((d) => (
            <li key={d.id} className="catalog-text">
              <b>
                {d.incoming
                  ? `Transferencia recibida de ${m.vesselName(d.otherVesselId)}`
                  : d.kind === 'transfer'
                    ? `Transferido a ${m.vesselName(d.otherVesselId)}`
                    : SURPLUS_KIND_LABEL[d.kind]}
              </b>
              {` · ${tonsText(d.tons)} · ${d.createdBy ?? ''} · ${d.reason}`}
            </li>
          ))}
        </ul>
      )}
      {m.canEdit && (
        <div className="catalog-actions">
          <Button
            variant="secondary"
            onClick={m.openDispose}
            {...blocked(
              m.offlineReason ?? (v.unresolvedSurplusTons === '0.000' ? 'No hay sobrante sin destino.' : undefined),
            )}
          >
            Registrar un destino
          </Button>
        </div>
      )}
    </div>
  );
}

function History({ m }: { m: VesselsModel }) {
  const h = m.history;
  if (m.offlineReason) return <Notice tone="info">El historial se consulta con conexión al servidor.</Notice>;
  if (h === 'loading' || h === null) return <p className="catalog-text">Cargando el historial…</p>;
  if (h === 'error') return <Notice tone="bad">No se pudo cargar el historial. Inténtelo de nuevo.</Notice>;
  if (h.length === 0) return <p className="catalog-text">Sin cambios registrados.</p>;
  return (
    <ul className="catalog-cards" aria-label="Historial" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {h.map((e, i) => (
        <li key={i} className="catalog-text">
          <b>{e.action}</b>
          {` · ${e.userName ?? 'el sistema'} · ${dateText(e.at.slice(0, 10))}`}
          {e.reason && ` · ${e.reason}`}
        </li>
      ))}
    </ul>
  );
}

function VesselForm({ m }: { m: VesselsModel }) {
  const isNew = m.mode === 'new';
  const f = isNew ? m.createFields : m.editFields;
  const reason = !isNew ? m.editFields.reason : null;
  return (
    <form className="catalog-form" onSubmit={isNew ? m.submitCreate : m.submitEdit} noValidate>
      <UnsavedChangesGuard when={isNew ? m.createDirty : m.editDirty} />
      {(isNew ? m.createError : m.editError) && <Notice tone="bad">{isNew ? m.createError : m.editError}</Notice>}
      <ErrorSummary errors={isNew ? m.createSummary : m.editSummary} />
      <Field label="Nombre" {...(m.code ? { help: `Código: ${m.code}` } : {})} {...f.name.state}>
        <TextField autoComplete="off" {...f.name.control} />
      </Field>
      <Field label="Manifiesto" help="Por ejemplo 0080/2026" {...f.manifest.state}>
        <TextField autoComplete="off" {...f.manifest.control} />
      </Field>
      <Field label="B/L" {...f.bl.state}>
        <TextField autoComplete="off" {...f.bl.control} />
      </Field>
      <Field label="Puerto y terminal" {...f.port.state}>
        <TextField autoComplete="off" {...f.port.control} />
      </Field>
      <Field label="Comprador interno" {...f.internalBuyer.state}>
        <TextField autoComplete="off" {...f.internalBuyer.control} />
      </Field>
      <Field label="Fecha de arribo estimada" {...f.etaDate.state}>
        <TextField type="date" {...f.etaDate.control} />
      </Field>
      {isNew && (
        <Field
          label="Fecha de arribo real"
          help="Fija el año y el viaje de la numeración"
          {...m.createFields.arrivalDate.state}
        >
          <TextField type="date" {...m.createFields.arrivalDate.control} />
        </Field>
      )}
      <Field label="Total (t)" {...f.totalTons.state}>
        <TonsInput {...f.totalTons.control} />
      </Field>
      {reason && (
        <Field label="Motivo" help="Obligatorio si cambia el total; queda en la bitácora." {...reason.state}>
          <TextField autoComplete="off" {...reason.control} />
        </Field>
      )}
      <div className="catalog-actions">
        <Button
          type="submit"
          busy={isNew ? m.creating : m.editing}
          busyLabel="Guardando…"
          {...blocked(m.offlineReason)}
        >
          {isNew ? 'Crear buque' : 'Guardar'}
        </Button>
        <Button variant="ghost" onClick={isNew ? m.close : m.cancelMode}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function ArrivalForm({ m, v }: { m: VesselsModel; v: VesselDto }) {
  const f = m.arrivalFields;
  return (
    <form className="catalog-form" onSubmit={m.submitArrival} noValidate>
      <UnsavedChangesGuard when={m.arrivalDirty} />
      {m.arrivalError && <Notice tone="bad">{m.arrivalError}</Notice>}
      <ErrorSummary errors={m.arrivalSummary} />
      <Field label="Fecha de arribo real" help="Fija el año y el viaje de la numeración" {...f.arrivalDate.state}>
        <TextField type="date" {...f.arrivalDate.control} />
      </Field>
      {v.arrivalDate && (
        <Field label="Motivo" help="Corregir la fecha pide motivo; queda en la bitácora." {...f.reason.state}>
          <TextField autoComplete="off" {...f.reason.control} />
        </Field>
      )}
      <div className="catalog-actions">
        <Button type="submit" busy={m.savingArrival} busyLabel="Guardando…" {...blocked(m.offlineReason)}>
          {v.arrivalDate ? 'Corregir el arribo' : 'Registrar el arribo'}
        </Button>
        <Button variant="ghost" onClick={m.cancelMode}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function AssignForm({ m, v }: { m: VesselsModel; v: VesselDto }) {
  const f = m.assignFields;
  return (
    <form className="catalog-form" onSubmit={m.submitAssign} noValidate>
      <UnsavedChangesGuard when={m.assignDirty} />
      {m.assignError && <Notice tone="bad">{m.assignError}</Notice>}
      <ErrorSummary errors={m.assignSummary} />
      <Field label="DM" {...f.declarationId.state}>
        {selectOf(f.declarationId.control, m.declarationOptions, 'Elija la DM')}
      </Field>
      <Field label="Toneladas" help={`Libre en el buque: ${tonsText(v.freeTons)}`} {...f.tons.state}>
        <TonsInput {...f.tons.control} />
      </Field>
      <div className="catalog-actions">
        <Button type="submit" busy={m.assigning} busyLabel="Asignando…" {...blocked(m.offlineReason)}>
          Asignar
        </Button>
        <Button variant="ghost" onClick={m.cancelMode}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function DisposeForm({ m, v }: { m: VesselsModel; v: VesselDto }) {
  const f = m.disposeFields;
  return (
    <form className="catalog-form" onSubmit={m.submitDispose} noValidate>
      <UnsavedChangesGuard when={m.disposeDirty} />
      {m.disposeError && <Notice tone="bad">{m.disposeError}</Notice>}
      <ErrorSummary errors={m.disposeSummary} />
      <Field label="Tipo de destino" {...f.kind.state}>
        {selectOf(f.kind.control, m.kindOptions, 'Elija el destino')}
      </Field>
      {m.disposeKind === 'transfer' && (
        <Field label="Buque destino" help="El total del buque destino aumenta" {...f.targetVesselId.state}>
          {selectOf(f.targetVesselId.control, m.targetVesselOptions, 'Elija el buque')}
        </Field>
      )}
      {m.disposeKind === 'allocate' && (
        <Field label="DM" {...f.targetDeclarationId.state}>
          {selectOf(f.targetDeclarationId.control, m.declarationOptions, 'Elija la DM')}
        </Field>
      )}
      <Field label="Toneladas" help={`Sobrante sin destino: ${tonsText(v.unresolvedSurplusTons)}`} {...f.tons.state}>
        <TonsInput {...f.tons.control} />
      </Field>
      <Field label="Motivo" help="Queda registrado en la bitácora." {...f.reason.state}>
        <TextField autoComplete="off" {...f.reason.control} />
      </Field>
      <div className="catalog-actions">
        <Button type="submit" busy={m.disposing} busyLabel="Registrando…" {...blocked(m.offlineReason)}>
          Registrar el destino
        </Button>
        <Button variant="ghost" onClick={m.cancelMode}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function Panel({ m }: { m: VesselsModel }) {
  const v = m.selected;
  if (m.mode === 'new') return <VesselForm m={m} />;
  if (!v) return null;
  if (m.mode === 'edit') return <VesselForm m={m} />;
  if (m.mode === 'arrival') return <ArrivalForm m={m} v={v} />;
  if (m.mode === 'assign') return <AssignForm m={m} v={v} />;
  if (m.mode === 'dispose') return <DisposeForm m={m} v={v} />;
  return (
    <Tabs
      label="Ficha del buque"
      value={m.tab}
      onChange={(t) => m.setTab(t as VesselTab)}
      tabs={[
        { id: 'summary', label: 'Resumen', content: <Summary m={m} v={v} /> },
        { id: 'declarations', label: `DM (${m.declarationsOf(v).length})`, content: <Declarations m={m} v={v} /> },
        { id: 'surplus', label: 'Sobrante', content: <Surplus m={m} v={v} /> },
        { id: 'history', label: 'Historial', content: <History m={m} /> },
      ]}
    />
  );
}

function Dialogs({ m }: { m: VesselsModel }) {
  const v = m.selected;
  return (
    <>
      {m.exceeds && (
        <OverrideDialog
          title={m.exceeds.title}
          rule={`Si continúa, se asignan ${tonsText(m.exceeds.free)} (lo libre del buque) y el resto queda pendiente de asignar, para otro buque.`}
          confirmLabel={`Sí, asignar ${tonsText(m.exceeds.free)}`}
          onConfirm={(reason) => void m.exceeds!.confirm(reason)}
          onClose={m.exceedsNo}
        />
      )}
      {m.confirmClose && v && (
        <Dialog
          title={`Cerrar ${v.name}`}
          description="Un buque cerrado no admite asignaciones ni órdenes nuevas; sí correcciones y anulaciones de sus órdenes."
          onClose={m.cancelClose}
          footer={
            <>
              <Button variant="ghost" onClick={m.cancelClose}>
                Cancelar
              </Button>
              <Button onClick={m.closeVessel} busy={m.busy === 'cerrar'} busyLabel="Cerrando…">
                Cerrar el buque
              </Button>
            </>
          }
        />
      )}
    </>
  );
}

export function VesselsView({ model: m, device }: { model: VesselsModel; device: DeviceClass }) {
  const list =
    device === 'desktop' ? (
      <DataTable
        caption="Buques"
        columns={[
          { key: 'buque', header: 'Buque', cell: vesselLabel, sortable: true, sortValue: (v) => v.name },
          { key: 'estado', header: 'Estado', cell: (v) => <StatusBadge v={v} /> },
          { key: 'arribo', header: 'Arribo', cell: arrivalText },
          { key: 'total', header: 'Total', cell: (v) => tonsText(v.totalTons) },
          { key: 'asignado', header: 'Asignado', cell: (v) => tonsText(v.allocatedTons) },
          { key: 'libre', header: 'Libre', cell: (v) => tonsText(v.freeTons) },
          { key: 'cargado', header: 'Cargado', cell: (v) => tonsText(v.loadedTons) },
          { key: 'restante', header: 'Restante', cell: (v) => tonsText(v.remainingTons) },
        ]}
        rows={m.vessels}
        onRowClick={(v) => m.open(v.id)}
        changed={m.changed}
        empty="Aún no hay buques."
      />
    ) : (
      <div className="catalog-cards" role="list" aria-label="Buques">
        {m.vessels.length === 0 && <EmptyState title="Aún no hay buques." />}
        {m.vessels.map((v) => (
          <div role="listitem" key={v.id}>
            <ListCard
              title={vesselLabel(v)}
              aside={<StatusBadge v={v} />}
              selected={m.selected?.id === v.id}
              changed={m.changed.has(v.id)}
              onOpen={() => m.open(v.id)}
            >
              {`${arrivalText(v)} · libre ${tonsText(v.freeTons)} · restante ${tonsText(v.remainingTons)}`}
            </ListCard>
          </div>
        ))}
      </div>
    );
  const title = m.mode === 'new' ? 'Nuevo buque' : m.selected ? vesselLabel(m.selected) : null;
  return (
    <CatalogLayout
      device={device}
      list={list}
      newLabel="Nuevo buque"
      onNew={m.openNew}
      canEdit={m.canEdit}
      offlineReason={m.offlineReason}
      notice={m.notice}
      panelTitle={title}
      panel={<Panel m={m} />}
      onClose={m.close}
      emptyDetail="Elija un buque para ver sus saldos, sus DM y su sobrante."
      dialogs={<Dialogs m={m} />}
    />
  );
}
