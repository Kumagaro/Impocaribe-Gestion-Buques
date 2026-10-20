// T059 · P-20: lista, formulario y confirmación de desactivar, iguales en las tres clases (maqueta T057).
import type { CarrierDto } from '@impocaribe/shared/validation';
import { Button, TextField } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { ErrorSummary, Field, UnsavedChangesGuard } from '../../ui/form';
import { Dialog } from '../../ui/overlays';
import { Badge, ListCard, Notice } from '../../ui/presentation';
import { DataTable } from '../../ui/structure';
import { blocked, CatalogLayout } from './CatalogLayout';
import { deactivateText, fleetText, type CarriersModel } from './useCarriers';

export const StatusBadge = ({ active }: { active: boolean }) =>
  active ? <Badge tone="ok">Activo</Badge> : <Badge tone="mute">Inactivo</Badge>;

const fleet = (m: CarriersModel, c: CarrierDto) => fleetText(m.counts(c.id));

function CarrierForm({ model }: { model: CarriersModel }) {
  const editing = model.panel?.kind === 'edit' ? model.panel.carrier : null;
  const f = model.nameField;
  // EST-05: Solo lectura ve los datos, sin formulario.
  if (!model.canEdit && editing)
    return (
      <div className="catalog-form">
        <p className="catalog-text">{fleet(model, editing)}</p>
        <StatusBadge active={editing.active} />
        <div className="catalog-actions">
          <Button variant="ghost" onClick={model.close}>
            Cerrar
          </Button>
        </div>
      </div>
    );
  return (
    <form className="catalog-form" onSubmit={model.submit} noValidate>
      <UnsavedChangesGuard when={model.dirty} />
      {model.formError && <Notice tone="bad">{model.formError}</Notice>}
      <ErrorSummary errors={model.summary} />
      <Field
        label="Nombre"
        help="Se imprime como «Vehículo perteneciente a»"
        {...f.state}
        error={f.state.error ?? model.sameReason}
      >
        <TextField autoComplete="off" {...f.control} invalid={f.control.invalid || model.sameReason !== undefined} />
      </Field>
      {editing && <p className="catalog-text">{fleet(model, editing)}</p>}
      <div className="catalog-actions">
        <Button
          type="submit"
          busy={model.saving}
          busyLabel="Guardando…"
          {...blocked(model.offlineReason ?? model.sameReason)}
        >
          {editing ? 'Guardar' : 'Crear transportista'}
        </Button>
        {editing &&
          (editing.active ? (
            <Button variant="danger" onClick={() => model.askDeactivate(editing)} {...blocked(model.offlineReason)}>
              Desactivar
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => model.activate(editing)}
              busy={model.busy === `activar-${editing.id}`}
              {...blocked(model.offlineReason)}
            >
              Activar
            </Button>
          ))}
        <Button variant="ghost" onClick={model.close}>
          Cerrar
        </Button>
      </div>
    </form>
  );
}

function DeactivateDialog({ model }: { model: CarriersModel }) {
  const c = model.confirm;
  if (!c) return null;
  return (
    <Dialog
      title={`Desactivar ${c.name}`}
      description={deactivateText(model.counts(c.id))}
      onClose={model.cancelDeactivate}
      footer={
        <>
          <Button variant="ghost" onClick={model.cancelDeactivate}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => model.deactivate(c)}
            busy={model.busy === `desactivar-${c.id}`}
            busyLabel="Desactivando…"
          >
            Desactivar
          </Button>
        </>
      }
    />
  );
}

export function CarriersView({ model, device }: { model: CarriersModel; device: DeviceClass }) {
  const open = model.openEdit;
  const selected = model.panel?.kind === 'edit' ? model.panel.carrier.id : null;
  const list =
    device === 'desktop' ? (
      <DataTable
        caption="Transportistas"
        columns={[
          { key: 'nombre', header: 'Nombre', cell: (c) => c.name, sortable: true, sortValue: (c) => c.name },
          { key: 'flota', header: 'Camiones, remolques y choferes', cell: (c) => fleet(model, c) },
          { key: 'estado', header: 'Estado', cell: (c) => <StatusBadge active={c.active} /> },
        ]}
        rows={model.carriers}
        onRowClick={open}
        changed={model.changed}
        empty="Aún no hay transportistas."
      />
    ) : (
      <div className="catalog-cards" role="list" aria-label="Transportistas">
        {model.carriers.length === 0 && <p className="catalog-text">Aún no hay transportistas.</p>}
        {model.carriers.map((c) => (
          <div role="listitem" key={c.id}>
            <ListCard
              title={c.name}
              aside={<StatusBadge active={c.active} />}
              selected={c.id === selected}
              changed={model.changed.has(c.id)}
              onOpen={() => open(c)}
            >
              {fleet(model, c)}
            </ListCard>
          </div>
        ))}
      </div>
    );
  const title = model.panel?.kind === 'new' ? 'Nuevo transportista' : (model.panel?.carrier.name ?? null);
  return (
    <CatalogLayout
      device={device}
      list={list}
      newLabel="Nuevo transportista"
      onNew={model.openNew}
      canEdit={model.canEdit}
      offlineReason={model.offlineReason}
      notice={model.notice}
      panelTitle={title}
      panel={<CarrierForm model={model} />}
      onClose={model.close}
      emptyDetail="Elija un transportista para ver sus datos."
      dialogs={<DeactivateDialog model={model} />}
    />
  );
}
