// T072 · P-09 a P-11: lista con filtros y contadores, ficha, alta, edición, asignación y reactivación, iguales en las
// tres clases salvo el alta, que en TEL va en dos pasos (ui-spec y maqueta T070).
import { DECLARATION_STATUS_LABEL, DEADLINE_DAYS, deadlineText } from '@impocaribe/shared';
import type { DeclarationDto } from '@impocaribe/shared/validation';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { Button, Select, TextField, TonsInput } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { ErrorSummary, Field, UnsavedChangesGuard } from '../../ui/form';
import { OverrideDialog, ReasonDialog } from '../../ui/overlays';
import { Badge, EmptyState, ListCard, Notice, ProgressBar } from '../../ui/presentation';
import { DataTable, Stepper, Tabs } from '../../ui/structure';
import { blocked, CatalogLayout } from '../catalogs/CatalogLayout';
import { selectOf } from '../catalogs/Fleet.parts';
import {
  dateText,
  FILTERS,
  filterLabel,
  progressOf,
  STAGES,
  STATUS_TONE,
  tonsText,
  type DeclarationsModel,
} from './useDeclarations';

export const StatusBadge = ({ m, d }: { m: DeclarationsModel; d: DeclarationDto }) => {
  const s = m.status(d);
  return <Badge tone={STATUS_TONE[s]}>{DECLARATION_STATUS_LABEL[s]}</Badge>;
};

/** RF-PLZ-05: «n/30», ámbar desde el día 25. */
function DeadlineBadge({ m, d }: { m: DeclarationsModel; d: DeclarationDto }) {
  const s = m.status(d);
  if (s === 'closed') return null;
  if (s === 'expired') return <Badge tone="bad">Vencido</Badge>;
  const day = m.dayOf(d);
  return <Badge tone={day >= 25 ? 'warn' : 'mute'}>{deadlineText(day)}</Badge>;
}

const Progress = ({ d }: { d: DeclarationDto }) => (
  <span className="dm-progress">
    <ProgressBar label={`Avance de la DM ${d.number}`} value={parseFloat(progressOf(d).replace(',', '.'))} tone="ok" />
    <span className="dm-num">{progressOf(d)} %</span>
  </span>
);

function Summary({ m, d }: { m: DeclarationsModel; d: DeclarationDto }) {
  const s = m.status(d);
  const stage = m.stage;
  const [legal, setLegal] = useState(false);
  return (
    <div className="catalog-form">
      {s === 'expired' && (
        <Notice tone="bad">
          {`La DM venció${d.expiredAt ? ` el ${dateText(d.expiredAt.slice(0, 10))}` : ''}: su restante volvió libre al buque. Sus órdenes se pueden corregir sin aumentar toneladas, o anular.`}
        </Notice>
      )}
      <ol className="dm-stages" aria-label="Etapas">
        {stage === 'expired' ? (
          <li data-state="now">Vencida</li>
        ) : (
          STAGES.map((label, i) => (
            <li key={label} data-state={i < stage ? 'done' : i === stage ? 'now' : undefined}>
              {label}
            </li>
          ))
        )}
      </ol>
      <dl className="dm-kv">
        <dt>Cliente</dt>
        <dd>{m.clientName(d.clientId)}</dd>
        <dt>Marca</dt>
        <dd>{d.brand}</dd>
        <dt>Fecha de la DM</dt>
        <dd>{dateText(d.declarationDate)}</dd>
        <dt>Total</dt>
        <dd className="dm-num">{d.totalTons === null ? 'Pendiente de total' : tonsText(d.totalTons)}</dd>
        <dt>Asignado</dt>
        <dd className="dm-num">{tonsText(d.allocatedTons)}</dd>
        <dt>Cargado</dt>
        <dd className="dm-num">{tonsText(d.loadedTons)}</dd>
        <dt>Saldo</dt>
        <dd className="dm-num">{tonsText(d.balanceTons)}</dd>
        <dt>Pendiente de asignar</dt>
        <dd className="dm-num">{tonsText(d.pendingAllocationTons)}</dd>
      </dl>
      {m.deadline && s !== 'closed' && (
        <div className="catalog-form" style={{ gap: 6 }}>
          <span className="dm-row">
            <b>{s === 'expired' ? 'Plazo vencido' : `Plazo · día ${m.deadline.day} de ${DEADLINE_DAYS}`}</b>
            <Button variant="ghost" aria-expanded={legal} onClick={() => setLegal(!legal)}>
              Aviso legal
            </Button>
          </span>
          <ProgressBar
            label="Días del plazo"
            value={(Math.min(m.deadline.day, DEADLINE_DAYS) / DEADLINE_DAYS) * 100}
            tone={m.deadline.expired ? 'bad' : m.deadline.warning ? 'warn' : 'info'}
          />
          {!m.deadline.expired && m.lastDay && (
            <p className="catalog-text">{`Último día para emitir: ${dateText(m.lastDay)}.`}</p>
          )}
          {legal && <p className="catalog-text">{m.legalNotice}</p>}
        </div>
      )}
      <section aria-label="Asignaciones" className="catalog-form" style={{ gap: 6 }}>
        <b>Asignaciones</b>
        {d.allocations.length === 0 ? (
          <p className="catalog-text">Aún no está asignada a ningún buque.</p>
        ) : (
          <ul className="catalog-cards" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {d.allocations.map((a) => {
              const v = m.vesselOf(a.vesselId);
              return (
                <li key={a.id} className="dm-row">
                  <span>{v ? `${v.name}${v.voyageNo ? ` · V${v.voyageNo}` : ''}` : 'Buque'}</span>
                  <span className="dm-num">{`${tonsText(a.allocatedTons)} · saldo ${tonsText(a.balanceTons)}`}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {m.canEdit && (
        <div className="catalog-actions">
          {s === 'expired' ? (
            <Button onClick={m.askReactivate} {...blocked(m.offlineReason)}>
              Reactivar
            </Button>
          ) : (
            <Button variant="secondary" onClick={m.openAssign} {...blocked(m.offlineReason ?? m.assignBlocked)}>
              Asignar a un buque
            </Button>
          )}
          <Button variant="secondary" onClick={m.openEdit} {...blocked(m.offlineReason)}>
            Editar
          </Button>
          <Button variant="ghost" onClick={m.close}>
            Cerrar
          </Button>
        </div>
      )}
    </div>
  );
}

const KIND: Record<string, string> = {
  create: 'Alta',
  edit: 'Edición',
  reactivate: 'Reactivación',
  expire: 'Vencimiento',
  assign: 'Asignación',
  partial_assign: 'Asignación parcial',
  surplus_assign: 'Asignación del sobrante',
  expire_release: 'Liberada al vencer',
  void_release: 'Liberada al anular',
};

function History({ m }: { m: DeclarationsModel }) {
  const h = m.history;
  if (m.offlineReason) return <Notice tone="info">El historial se consulta con conexión al servidor.</Notice>;
  if (h === 'loading' || h === null) return <p className="catalog-text">Cargando el historial…</p>;
  if (h === 'error') return <Notice tone="bad">No se pudo cargar el historial. Inténtelo de nuevo.</Notice>;
  return (
    <ul className="catalog-cards" aria-label="Historial" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {h.versions.map((v) => (
        <li key={`v${v.versionNo}`} className="catalog-text">
          <b>{`Versión ${v.versionNo} · ${KIND[v.kind]}`}</b>
          {` · ${v.brand} · ${v.totalTons === null ? 'sin total' : tonsText(v.totalTons)} · ${v.createdBy ?? 'el sistema'}`}
          {v.reason && ` · ${v.reason}`}
        </li>
      ))}
      {h.allocationChanges.map((c, i) => (
        <li key={`a${i}`} className="catalog-text">
          <b>{KIND[c.kind]}</b>
          {` · ${m.vesselOf(c.vesselId)?.name ?? 'Buque'}: ${tonsText(c.previousTons)} → ${tonsText(c.newTons)}`}
          {c.reason && ` · ${c.reason}`}
        </li>
      ))}
    </ul>
  );
}

function CreateForm({ m, device }: { m: DeclarationsModel; device: DeviceClass }) {
  const f = m.createFields;
  // TEL: dos pasos (Datos → Asignación opcional).
  const [step, setStep] = useState(0);
  const steps = device === 'phone';
  const data = (
    <>
      <Field
        label="Número de DM"
        help="5 dígitos, por ejemplo 00431"
        exacting
        {...f.number.state}
        error={f.number.state.error ?? m.numberReason}
      >
        <TextField
          digitsOnly
          maxLength={5}
          inputMode="numeric"
          autoComplete="off"
          {...f.number.control}
          invalid={f.number.control.invalid || !!m.numberReason}
        />
      </Field>
      <Field label="Cliente" {...f.clientId.state}>
        {selectOf(f.clientId.control, m.clientOptions, 'Elija el cliente')}
      </Field>
      <Field label="Marca" {...f.brand.state}>
        <TextField autoComplete="off" {...f.brand.control} />
      </Field>
      <Field label="Total (t)" {...f.totalTons.state}>
        <TonsInput {...f.totalTons.control} />
      </Field>
      <Field label="Fecha de la DM" id="dm-fecha" warning={m.legalNotice}>
        <TextField id="dm-fecha" readOnly value={m.today} aria-describedby="dm-fecha-msg" />
      </Field>
    </>
  );
  const allocation = (
    <>
      <b>Asignación (opcional)</b>
      <Field label="Buque" {...f.vesselId.state}>
        {selectOf(f.vesselId.control, m.vesselOptions, 'Sin asignar por ahora')}
      </Field>
      {f.vesselId.control.value !== '' && (
        <Field label="Toneladas" {...f.allocationTons.state}>
          <TonsInput {...f.allocationTons.control} />
        </Field>
      )}
    </>
  );
  return (
    <form className="catalog-form" onSubmit={m.submitCreate} noValidate>
      <UnsavedChangesGuard when={m.createDirty} />
      {m.createError && <Notice tone="bad">{m.createError}</Notice>}
      <ErrorSummary errors={m.createSummary} />
      {steps && <Stepper steps={['Datos', 'Asignación']} current={step} />}
      {(!steps || step === 0) && data}
      {(!steps || step === 1) && allocation}
      <div className="catalog-actions">
        {steps && step === 0 ? (
          <Button onClick={() => void m.nextCreateStep().then((ok) => ok && setStep(1))}>Siguiente</Button>
        ) : (
          <Button type="submit" busy={m.creating} busyLabel="Creando…" {...blocked(m.offlineReason ?? m.numberReason)}>
            Crear DM
          </Button>
        )}
        {steps && step === 1 && (
          <Button variant="ghost" onClick={() => setStep(0)}>
            Atrás
          </Button>
        )}
        <Button variant="ghost" onClick={m.close}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function EditForm({ m, d }: { m: DeclarationsModel; d: DeclarationDto }) {
  const f = m.editFields;
  return (
    <form className="catalog-form" onSubmit={m.submitEdit} noValidate>
      <UnsavedChangesGuard when={m.editDirty} />
      {m.editError && <Notice tone="bad">{m.editError}</Notice>}
      <ErrorSummary errors={m.editSummary} />
      <p className="dm-row catalog-text">
        <Lock size={14} aria-hidden="true" />
        {`Cliente: ${m.clientName(d.clientId)} · Fecha: ${dateText(d.declarationDate)} · no cambian`}
      </p>
      <Field label="Marca" {...f.brand.state}>
        <TextField autoComplete="off" {...f.brand.control} />
      </Field>
      <Field
        label="Total (t)"
        help={`Ya cargado: ${tonsText(d.loadedTons)} · asignado: ${tonsText(d.allocatedTons)}`}
        {...f.totalTons.state}
      >
        <TonsInput {...f.totalTons.control} />
      </Field>
      <Field label="Motivo" help="Queda registrado en la bitácora." {...f.reason.state}>
        <TextField autoComplete="off" {...f.reason.control} />
      </Field>
      <div className="catalog-actions">
        <Button type="submit" busy={m.editing} busyLabel="Guardando…" {...blocked(m.offlineReason)}>
          Guardar versión
        </Button>
        <Button variant="ghost" onClick={m.cancelMode}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function AssignForm({ m, d }: { m: DeclarationsModel; d: DeclarationDto }) {
  const f = m.assignFields;
  return (
    <form className="catalog-form" onSubmit={m.submitAssign} noValidate>
      <UnsavedChangesGuard when={m.assignDirty} />
      {m.assignError && <Notice tone="bad">{m.assignError}</Notice>}
      <ErrorSummary errors={m.assignSummary} />
      <Field label="Buque" {...f.vesselId.state}>
        {selectOf(f.vesselId.control, m.vesselOptions, 'Elija el buque')}
      </Field>
      <Field label="Toneladas" help={`Pendiente de asignar: ${tonsText(d.pendingAllocationTons)}`} {...f.tons.state}>
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

function Panel({ m, device }: { m: DeclarationsModel; device: DeviceClass }) {
  const d = m.selected;
  if (m.mode === 'new') return <CreateForm m={m} device={device} />;
  if (!d) return null;
  if (m.mode === 'edit') return <EditForm m={m} d={d} />;
  if (m.mode === 'allocate') return <AssignForm m={m} d={d} />;
  return (
    <Tabs
      label="Ficha de la DM"
      value={m.tab}
      onChange={(t) => m.setTab(t as 'summary' | 'history')}
      tabs={[
        { id: 'summary', label: 'Resumen', content: <Summary m={m} d={d} /> },
        { id: 'history', label: 'Historial', content: <History m={m} /> },
      ]}
    />
  );
}

function Dialogs({ m }: { m: DeclarationsModel }) {
  const d = m.selected;
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
      {m.reactivating && d && (
        <ReasonDialog
          title={`Reactivar la DM ${d.number}`}
          description="El plazo vuelve a empezar hoy y lo restante queda pendiente de asignar, al mismo buque o a otro."
          confirmLabel="Reactivar"
          onConfirm={m.reactivate}
          onClose={m.cancelReactivate}
        />
      )}
    </>
  );
}

export function DeclarationsView({ model: m, device }: { model: DeclarationsModel; device: DeviceClass }) {
  const filtering = m.vesselFilter !== '' || m.clientFilter !== '' || m.search.trim() !== '' || m.filter !== 'all';
  const empty = filtering ? 'Ninguna DM coincide con el filtro.' : 'Aún no hay DM.';
  const list =
    device === 'desktop' ? (
      <DataTable
        caption="DM"
        columns={[
          { key: 'numero', header: 'DM', cell: (d) => d.number, sortable: true, sortValue: (d) => d.number },
          {
            key: 'cliente',
            header: 'Cliente y marca',
            cell: (d) => `${m.clientName(d.clientId)} · ${d.brand}`,
          },
          { key: 'estado', header: 'Estado', cell: (d) => <StatusBadge m={m} d={d} /> },
          { key: 'avance', header: 'Avance', cell: (d) => <Progress d={d} /> },
          { key: 'saldo', header: 'Saldo', cell: (d) => tonsText(d.balanceTons) },
          { key: 'plazo', header: 'Plazo', cell: (d) => <DeadlineBadge m={m} d={d} /> },
        ]}
        rows={m.shown}
        onRowClick={(d) => m.open(d.id)}
        changed={m.changed}
        empty={empty}
      />
    ) : (
      <div className="catalog-cards" role="list" aria-label="DM">
        {m.shown.length === 0 && <EmptyState title={empty} />}
        {m.shown.map((d) => (
          <div role="listitem" key={d.id}>
            <ListCard
              title={d.number}
              aside={<StatusBadge m={m} d={d} />}
              selected={m.selected?.id === d.id}
              changed={m.changed.has(d.id)}
              onOpen={() => m.open(d.id)}
            >
              <span className="catalog-form" style={{ gap: 4 }}>
                <span>{`${m.clientName(d.clientId)} · ${d.brand}`}</span>
                <span className="dm-row">
                  <Progress d={d} />
                  <DeadlineBadge m={m} d={d} />
                </span>
              </span>
            </ListCard>
          </div>
        ))}
      </div>
    );
  const toolbar = (
    <div className="catalog-form">
      <div className="catalog-chips" role="group" aria-label="Estado">
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={m.filter === f} onClick={() => m.setFilter(f)}>
            {`${filterLabel(f)} ${m.counts[f]}`}
          </button>
        ))}
      </div>
      <div className="catalog-filters">
        <label className="ui-field">
          <span>Buscar</span>
          <TextField
            type="search"
            autoComplete="off"
            placeholder="Número, cliente o marca"
            value={m.search}
            onValueChange={m.setSearch}
          />
        </label>
        <label className="ui-field">
          <span>Buque</span>
          <Select
            value={m.vesselFilter}
            onValueChange={m.setVesselFilter}
            options={[{ value: '', label: 'Todos' }, ...m.vesselFilterOptions]}
          />
        </label>
        <label className="ui-field">
          <span>Cliente</span>
          <Select
            value={m.clientFilter}
            onValueChange={m.setClientFilter}
            options={[{ value: '', label: 'Todos' }, ...m.clientFilterOptions]}
          />
        </label>
      </div>
    </div>
  );
  const title = m.mode === 'new' ? 'Nueva DM' : m.selected ? `DM ${m.selected.number}` : null;
  return (
    <CatalogLayout
      device={device}
      toolbar={toolbar}
      list={list}
      newLabel="Nueva DM"
      onNew={m.openNew}
      canEdit={m.canEdit}
      offlineReason={m.offlineReason}
      notice={m.notice}
      panelTitle={title}
      panel={<Panel m={m} device={device} />}
      onClose={m.close}
      emptyDetail="Elija una DM para ver sus saldos, asignaciones y plazo."
      dialogs={<Dialogs m={m} />}
    />
  );
}
