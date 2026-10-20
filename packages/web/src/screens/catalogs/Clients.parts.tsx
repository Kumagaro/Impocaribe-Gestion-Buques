// T059 · P-19: lista, formulario con sus destinatarios y confirmación de desactivar, iguales en las tres clases
// (maqueta T057).
import { Plus } from 'lucide-react';
import { Button, TextField } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { ErrorSummary, Field, UnsavedChangesGuard } from '../../ui/form';
import { Dialog } from '../../ui/overlays';
import { Badge, ListCard, Notice } from '../../ui/presentation';
import { DataTable } from '../../ui/structure';
import { blocked, CatalogLayout } from './CatalogLayout';
import { StatusBadge } from './Carriers.parts';
import { recipientsText, type ClientsModel } from './useClients';

function Recipients({ model }: { model: ClientsModel }) {
  return (
    <section className="catalog-form" aria-labelledby="cli-destinatarios">
      <h3 id="cli-destinatarios" className="catalog-title" style={{ fontSize: 14 }}>
        Destinatarios
      </h3>
      {model.recipientsError && <Notice tone="bad">{model.recipientsError}</Notice>}
      <ol className="catalog-cards" style={{ margin: 0, padding: 0, listStyle: 'none' }} aria-label="Destinatarios">
        {model.recipients.map((r, i) => (
          <li key={r.key} className="catalog-recipient" data-inactive={r.active ? undefined : 'true'}>
            <div className="catalog-recipient__head">
              <b>{`Destinatario ${i + 1}`}</b>
              {!r.active && <Badge tone="mute">Inactivo</Badge>}
              {r.saved ? (
                <Button variant="ghost" onClick={() => model.toggleRecipient(i, !r.active)}>
                  {r.active ? `Desactivar el destinatario ${i + 1}` : `Activar el destinatario ${i + 1}`}
                </Button>
              ) : (
                model.recipients.length > 1 && (
                  <Button variant="ghost" onClick={() => model.removeRecipient(i)}>
                    {`Quitar el destinatario ${i + 1}`}
                  </Button>
                )
              )}
            </div>
            <Field label="Nombre del destinatario" help="Se imprime como «Nombre del destinatario»" {...r.name.state}>
              <TextField autoComplete="off" {...r.name.control} />
            </Field>
            <Field label="Dirección" help="Se imprime como «Con destino a»" {...r.address.state}>
              <TextField autoComplete="off" {...r.address.control} />
            </Field>
          </li>
        ))}
      </ol>
      <Button variant="ghost" icon={<Plus size={16} aria-hidden="true" />} onClick={model.addRecipient}>
        Añadir destinatario
      </Button>
    </section>
  );
}

function ClientForm({ model }: { model: ClientsModel }) {
  const editing = model.panel?.kind === 'edit' ? model.panel.client : null;
  // EST-05: Solo lectura ve los datos, sin formulario.
  if (!model.canEdit && editing)
    return (
      <div className="catalog-form">
        <StatusBadge active={editing.active} />
        <ul className="catalog-cards" aria-label="Destinatarios">
          {editing.recipients.map((r) => (
            <li key={r.id} className="catalog-text">
              <b>{r.name}</b> · {r.address}
              {!r.active && ' (inactivo)'}
            </li>
          ))}
        </ul>
        <div className="catalog-actions">
          <Button variant="ghost" onClick={model.close}>
            Cerrar
          </Button>
        </div>
      </div>
    );
  const f = model.nameField;
  return (
    <form className="catalog-form" onSubmit={model.submit} noValidate>
      <UnsavedChangesGuard when={model.dirty} />
      {model.formError && <Notice tone="bad">{model.formError}</Notice>}
      <ErrorSummary errors={model.summary} />
      <Field label="Nombre" {...f.state} error={f.state.error ?? model.sameReason}>
        <TextField autoComplete="off" {...f.control} invalid={f.control.invalid || model.sameReason !== undefined} />
      </Field>
      <Recipients model={model} />
      <div className="catalog-actions">
        <Button
          type="submit"
          busy={model.saving}
          busyLabel="Guardando…"
          {...blocked(model.offlineReason ?? model.sameReason)}
        >
          {editing ? 'Guardar' : 'Crear cliente'}
        </Button>
        {editing &&
          (editing.active ? (
            <Button variant="danger" onClick={() => model.askDeactivate(editing)} {...blocked(model.offlineReason)}>
              Desactivar el cliente
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => model.activate(editing)}
              busy={model.busy === `activar-${editing.id}`}
              {...blocked(model.offlineReason)}
            >
              Activar el cliente
            </Button>
          ))}
        <Button variant="ghost" onClick={model.close}>
          Cerrar
        </Button>
      </div>
    </form>
  );
}

function DeactivateDialog({ model }: { model: ClientsModel }) {
  const c = model.confirm;
  if (!c) return null;
  return (
    <Dialog
      title={`Desactivar ${c.name}`}
      description="No se podrá elegir en DM nuevas. Lo ya registrado con él no cambia."
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

export function ClientsView({ model, device }: { model: ClientsModel; device: DeviceClass }) {
  const selected = model.panel?.kind === 'edit' ? model.panel.client.id : null;
  const list =
    device === 'desktop' ? (
      <DataTable
        caption="Clientes"
        columns={[
          { key: 'nombre', header: 'Nombre', cell: (c) => c.name, sortable: true, sortValue: (c) => c.name },
          { key: 'destinatarios', header: 'Destinatarios', cell: recipientsText },
          { key: 'estado', header: 'Estado', cell: (c) => <StatusBadge active={c.active} /> },
        ]}
        rows={model.clients}
        onRowClick={model.openEdit}
        changed={model.changed}
        empty="Aún no hay clientes."
      />
    ) : (
      <div className="catalog-cards" role="list" aria-label="Clientes">
        {model.clients.length === 0 && <p className="catalog-text">Aún no hay clientes.</p>}
        {model.clients.map((c) => (
          <div role="listitem" key={c.id}>
            <ListCard
              title={c.name}
              aside={<StatusBadge active={c.active} />}
              selected={c.id === selected}
              changed={model.changed.has(c.id)}
              onOpen={() => model.openEdit(c)}
            >
              {`Destinatarios: ${recipientsText(c)}`}
            </ListCard>
          </div>
        ))}
      </div>
    );
  const title = model.panel?.kind === 'new' ? 'Nuevo cliente' : (model.panel?.client.name ?? null);
  return (
    <CatalogLayout
      device={device}
      list={list}
      newLabel="Nuevo cliente"
      onNew={model.openNew}
      canEdit={model.canEdit}
      offlineReason={model.offlineReason}
      notice={model.notice}
      panelTitle={title}
      panel={<ClientForm model={model} />}
      onClose={model.close}
      emptyDetail="Elija un cliente para ver sus destinatarios."
      dialogs={<DeactivateDialog model={model} />}
    />
  );
}
