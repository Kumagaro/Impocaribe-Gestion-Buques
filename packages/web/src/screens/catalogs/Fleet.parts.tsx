// T058 · P-18 Choferes y camiones: pestañas, filtro, formularios y cambio de transportista, iguales en las tres clases
// salvo el alta del camión, que en TEL va por pasos (ui-spec P-18 y maqueta T057).
import type { DriverDto, TrailerDto, TruckDto } from '@impocaribe/shared/validation';
import type { ReactNode } from 'react';
import { Button, Select, TextField, TonsInput, type Option } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { ErrorSummary, Field, UnsavedChangesGuard } from '../../ui/form';
import { Dialog } from '../../ui/overlays';
import { ListCard, Notice } from '../../ui/presentation';
import { DataTable, Stepper, Tabs, type Column } from '../../ui/structure';
import type { FieldControl } from '../../validation/useValidatedForm';
import { StatusBadge } from './Carriers.parts';
import { blocked, CatalogLayout } from './CatalogLayout';
import { capacityOf, type FleetModel, type FleetTab } from './useFleet';

/** Un `Select` con el contrato de campo del formulario (RF-VAL-02). */
export const selectOf = (c: FieldControl, options: Option[], placeholder: string) => (
  <Select
    id={c.id}
    name={c.name}
    aria-describedby={c['aria-describedby']}
    invalid={c.invalid}
    value={c.value}
    onValueChange={c.onValueChange}
    options={[{ value: '', label: placeholder }, ...options]}
  />
);

/** Los transportistas elegibles: activos, más el que ya tiene (aunque esté inactivo). */
const carrierChoices = (m: FleetModel, current: string): Option[] =>
  current && !m.carrierOptions.some((o) => o.value === current)
    ? [...m.carrierOptions, { value: current, label: `${m.carrierName(current)} (inactivo)` }]
    : m.carrierOptions;

function Actions({
  m,
  saving,
  submitLabel,
  reason,
  item,
  kind,
  label,
  children,
}: {
  m: FleetModel;
  saving: boolean;
  submitLabel: string;
  reason: string | undefined;
  item: { id: string; active: boolean } | null;
  kind: 'truck' | 'trailer' | 'driver';
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="catalog-actions">
      <Button type="submit" busy={saving} busyLabel="Guardando…" {...blocked(m.offlineReason ?? reason)}>
        {submitLabel}
      </Button>
      {children}
      {item && (
        <Button
          variant={item.active ? 'danger' : 'secondary'}
          onClick={() => m.toggle(kind, item, label)}
          busy={m.busy === `${item.active ? 'desactivar' : 'activar'}-${item.id}`}
          {...blocked(m.offlineReason)}
        >
          {item.active ? 'Desactivar' : 'Activar'}
        </Button>
      )}
      <Button variant="ghost" onClick={m.close}>
        Cerrar
      </Button>
    </div>
  );
}

/** EST-05: Solo lectura ve los datos, sin formulario. */
function ReadOnly({ m, lines, active }: { m: FleetModel; lines: string[]; active: boolean }) {
  return (
    <div className="catalog-form">
      {lines.map((l) => (
        <p key={l} className="catalog-text">
          {l}
        </p>
      ))}
      <StatusBadge active={active} />
      <div className="catalog-actions">
        <Button variant="ghost" onClick={m.close}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}

function TrailerChips({ m }: { m: FleetModel }) {
  return (
    <div className="catalog-form">
      <span className="catalog-title" style={{ fontSize: 14 }} id="fleet-remolques">
        Remolques habituales
      </span>
      {m.truckTrailersError && <Notice tone="bad">{m.truckTrailersError}</Notice>}
      {m.truckTrailerChoices.length === 0 ? (
        <p className="catalog-text">Este transportista aún no tiene remolques activos.</p>
      ) : (
        <ul className="catalog-chips" aria-labelledby="fleet-remolques">
          {m.truckTrailerChoices.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={m.truckTrailers.includes(t.id)}
                onClick={() => m.toggleTrailer(t.id)}
              >{`${t.plate} · ${capacityOf([t.id], m.trailers)}`}</button>
            </li>
          ))}
        </ul>
      )}
      <p className="catalog-text">{`Capacidad total: ${m.truckCapacity}`}</p>
    </div>
  );
}

const TRUCK_STEPS = ['Datos', 'Remolques', 'Revisar'];

function TruckForm({ m, device }: { m: FleetModel; device: DeviceClass }) {
  const item = m.panel?.kind === 'truck' ? m.panel.item : null;
  if (!m.canEdit && item)
    return (
      <ReadOnly
        m={m}
        active={item.active}
        lines={[
          `Transportista: ${m.carrierName(item.carrierId)}`,
          `Basificado en: ${item.baseLocation}`,
          `Remolques: ${item.trailerIds.map((id) => m.trailers.find((t) => t.id === id)?.plate ?? '').join(', ')}`,
          `Capacidad total: ${capacityOf(item.trailerIds, m.trailers)}`,
        ]}
      />
    );
  const f = m.truckFields;
  // TEL: el alta va por pasos; editar y las otras clases, todo junto.
  const steps = device === 'phone' && !item;
  const step = steps ? m.truckStep : -1;
  const data = (
    <>
      <Field label="Transportista" {...f.carrierId.state}>
        {selectOf(f.carrierId.control, carrierChoices(m, f.carrierId.control.value), 'Elija el transportista')}
      </Field>
      <Field label="Chapa" exacting {...f.plate.state} error={f.plate.state.error ?? m.truckSameReason}>
        <TextField
          uppercase
          autoComplete="off"
          {...f.plate.control}
          invalid={f.plate.control.invalid || !!m.truckSameReason}
        />
      </Field>
      <Field label="Chapa del tractivo" help="Si tiene otra chapa" {...f.tractorPlate.state}>
        <TextField uppercase autoComplete="off" {...f.tractorPlate.control} />
      </Field>
      <Field label="Basificado en" help="Si se deja vacío: LA HABANA" {...f.baseLocation.state}>
        <TextField autoComplete="off" {...f.baseLocation.control} />
      </Field>
    </>
  );
  return (
    <form className="catalog-form" onSubmit={m.submitTruck} noValidate>
      <UnsavedChangesGuard when={m.truckDirty} />
      {m.truckError && <Notice tone="bad">{m.truckError}</Notice>}
      <ErrorSummary errors={m.truckSummary} />
      {steps && <Stepper steps={TRUCK_STEPS} current={step} />}
      {(!steps || step === 0) && data}
      {(!steps || step === 1) && <TrailerChips m={m} />}
      {step === 2 && (
        <p className="catalog-text">{`${f.plate.control.value} · ${m.carrierName(f.carrierId.control.value)} · ${m.truckTrailers.length} remolque(s) · ${m.truckCapacity}`}</p>
      )}
      {steps && step < 2 ? (
        <div className="catalog-actions">
          <Button onClick={() => void m.nextTruckStep()}>Siguiente</Button>
          {step > 0 && (
            <Button variant="ghost" onClick={m.prevTruckStep}>
              Atrás
            </Button>
          )}
        </div>
      ) : (
        <Actions
          m={m}
          saving={m.savingTruck}
          submitLabel={item ? 'Guardar' : 'Crear camión'}
          reason={m.truckSameReason}
          item={item}
          kind="truck"
          label={`El camión ${item?.plate ?? ''}`}
        />
      )}
    </form>
  );
}

function TrailerForm({ m }: { m: FleetModel }) {
  const item = m.panel?.kind === 'trailer' ? m.panel.item : null;
  if (!m.canEdit && item)
    return (
      <ReadOnly
        m={m}
        active={item.active}
        lines={[`Transportista: ${m.carrierName(item.carrierId)}`, `Capacidad: ${capacityOf([item.id], m.trailers)}`]}
      />
    );
  const f = m.trailerFields;
  return (
    <form className="catalog-form" onSubmit={m.submitTrailer} noValidate>
      <UnsavedChangesGuard when={m.trailerDirty} />
      {m.trailerError && <Notice tone="bad">{m.trailerError}</Notice>}
      <ErrorSummary errors={m.trailerSummary} />
      <Field label="Transportista" {...f.carrierId.state}>
        {selectOf(f.carrierId.control, carrierChoices(m, f.carrierId.control.value), 'Elija el transportista')}
      </Field>
      <Field label="Chapa" exacting {...f.plate.state} error={f.plate.state.error ?? m.trailerSameReason}>
        <TextField
          uppercase
          autoComplete="off"
          {...f.plate.control}
          invalid={f.plate.control.invalid || !!m.trailerSameReason}
        />
      </Field>
      <Field label="Capacidad (t)" {...f.capacityTons.state}>
        <TonsInput {...f.capacityTons.control} />
      </Field>
      <Actions
        m={m}
        saving={m.savingTrailer}
        submitLabel={item ? 'Guardar' : 'Crear remolque'}
        reason={m.trailerSameReason}
        item={item}
        kind="trailer"
        label={`El remolque ${item?.plate ?? ''}`}
      />
    </form>
  );
}

function DriverForm({ m }: { m: FleetModel }) {
  const item = m.panel?.kind === 'driver' ? m.panel.item : null;
  if (!m.canEdit && item)
    return (
      <ReadOnly
        m={m}
        active={item.active}
        lines={[
          `Carné: ${item.nationalId}`,
          `Licencia: ${item.licenseNo}`,
          `Transportista: ${m.carrierName(item.carrierId)}`,
        ]}
      />
    );
  const f = m.driverFields;
  const reason = m.driverIdReason ?? m.driverLicenseReason;
  return (
    <form className="catalog-form" onSubmit={m.submitDriver} noValidate>
      <UnsavedChangesGuard when={m.driverDirty} />
      {m.driverError && <Notice tone="bad">{m.driverError}</Notice>}
      <ErrorSummary errors={m.driverSummary} />
      <Field label="Nombre y apellidos" {...f.fullName.state}>
        <TextField autoComplete="off" {...f.fullName.control} />
      </Field>
      <Field
        label="Carné de identidad"
        exacting
        {...f.nationalId.state}
        error={f.nationalId.state.error ?? m.driverIdReason}
      >
        <TextField
          digitsOnly
          maxLength={11}
          inputMode="numeric"
          autoComplete="off"
          {...f.nationalId.control}
          invalid={f.nationalId.control.invalid || !!m.driverIdReason}
        />
      </Field>
      <Field
        label="Licencia de conducción"
        exacting
        {...f.licenseNo.state}
        error={f.licenseNo.state.error ?? m.driverLicenseReason}
      >
        <TextField
          digitsOnly
          maxLength={11}
          inputMode="numeric"
          autoComplete="off"
          {...f.licenseNo.control}
          invalid={f.licenseNo.control.invalid || !!m.driverLicenseReason}
        />
      </Field>
      {item ? (
        <p className="catalog-text">{`Transportista: ${m.carrierName(item.carrierId)}`}</p>
      ) : (
        <Field label="Transportista" {...f.carrierId.state}>
          {selectOf(f.carrierId.control, m.carrierOptions, 'Elija el transportista')}
        </Field>
      )}
      <Actions
        m={m}
        saving={m.savingDriver}
        submitLabel={item ? 'Guardar' : 'Crear chofer'}
        reason={reason}
        item={item}
        kind="driver"
        label={item?.fullName ?? ''}
      >
        {item && (
          <Button variant="secondary" onClick={() => m.askMove(item)} {...blocked(m.offlineReason)}>
            Cambiar de transportista
          </Button>
        )}
      </Actions>
    </form>
  );
}

/** RF-CAT-09: el cambio de transportista de un chofer exige motivo y queda en la bitácora. */
function MoveDialog({ m }: { m: FleetModel }) {
  const d = m.moving;
  if (!d) return null;
  const f = m.moveFields;
  return (
    <Dialog
      title={`Cambiar el transportista de ${d.fullName}`}
      description={`Hoy es de ${m.carrierName(d.carrierId)}. El cambio queda en la bitácora con su motivo.`}
      onClose={m.cancelMove}
    >
      <form className="catalog-form" onSubmit={m.submitMove} noValidate>
        {m.moveError && <Notice tone="bad">{m.moveError}</Notice>}
        <Field label="Nuevo transportista" {...f.carrierId.state}>
          {selectOf(
            f.carrierId.control,
            m.carrierOptions.filter((o) => o.value !== d.carrierId),
            'Elija el transportista',
          )}
        </Field>
        <Field label="Motivo" help="Queda registrado en la bitácora." {...f.reason.state}>
          <TextField autoComplete="off" {...f.reason.control} />
        </Field>
        <div className="catalog-actions">
          <Button
            type="submit"
            variant="danger"
            busy={m.savingMove}
            busyLabel="Cambiando…"
            {...blocked(m.offlineReason)}
          >
            Cambiar
          </Button>
          <Button variant="ghost" onClick={m.cancelMove}>
            Cancelar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function List<R extends { id: string; active: boolean; carrierId: string }>({
  m,
  device,
  caption,
  rows,
  changed,
  columns,
  title,
  detail,
  onOpen,
  empty,
}: {
  m: FleetModel;
  device: DeviceClass;
  caption: string;
  rows: R[];
  changed: ReadonlySet<string>;
  columns: Column<R>[];
  title: (r: R) => string;
  detail: (r: R) => string;
  onOpen: (r: R) => void;
  empty: string;
}) {
  const status: Column<R> = { key: 'estado', header: 'Estado', cell: (r) => <StatusBadge active={r.active} /> };
  const carrier: Column<R> = {
    key: 'transportista',
    header: 'Transportista',
    cell: (r) => m.carrierName(r.carrierId),
    sortable: true,
    sortValue: (r) => m.carrierName(r.carrierId),
  };
  if (device === 'desktop')
    return (
      <DataTable
        caption={caption}
        columns={[...columns, carrier, status]}
        rows={rows}
        onRowClick={onOpen}
        changed={changed}
        empty={empty}
      />
    );
  return (
    <div className="catalog-cards" role="list" aria-label={caption}>
      {rows.length === 0 && <p className="catalog-text">{empty}</p>}
      {rows.map((r) => (
        <div role="listitem" key={r.id}>
          <ListCard
            title={title(r)}
            aside={<StatusBadge active={r.active} />}
            selected={m.panel?.item?.id === r.id}
            changed={changed.has(r.id)}
            onOpen={() => onOpen(r)}
          >
            {`${detail(r)} · ${m.carrierName(r.carrierId)}`}
          </ListCard>
        </div>
      ))}
    </div>
  );
}

const SEARCH: Record<FleetTab, string> = {
  trucks: 'Buscar por chapa',
  trailers: 'Buscar por chapa',
  drivers: 'Buscar por carné',
};

export function FleetView({ model: m, device }: { model: FleetModel; device: DeviceClass }) {
  const filtering = m.carrierFilter !== '' || m.search.trim() !== '';
  const empty = (one: string, many: string) =>
    filtering ? `Ningún ${one} coincide con el filtro.` : `Aún no hay ${many}.`;
  const trucks = (
    <List<TruckDto>
      m={m}
      device={device}
      caption="Camiones"
      rows={m.shown.trucks}
      changed={m.changed.trucks}
      columns={[
        { key: 'chapa', header: 'Chapa', cell: (t) => t.plate, sortable: true, sortValue: (t) => t.plate },
        { key: 'remolques', header: 'Remolques', cell: (t) => String(t.trailerIds.length) },
        { key: 'capacidad', header: 'Capacidad', cell: (t) => capacityOf(t.trailerIds, m.trailers) },
      ]}
      title={(t) => t.plate}
      detail={(t) => `${t.trailerIds.length} remolque(s) · ${capacityOf(t.trailerIds, m.trailers)}`}
      onOpen={m.openTruck}
      empty={empty('camión', 'camiones')}
    />
  );
  const trailers = (
    <List<TrailerDto>
      m={m}
      device={device}
      caption="Remolques"
      rows={m.shown.trailers}
      changed={m.changed.trailers}
      columns={[
        { key: 'chapa', header: 'Chapa', cell: (t) => t.plate, sortable: true, sortValue: (t) => t.plate },
        { key: 'capacidad', header: 'Capacidad', cell: (t) => capacityOf([t.id], m.trailers) },
      ]}
      title={(t) => t.plate}
      detail={(t) => `${capacityOf([t.id], m.trailers)}`}
      onOpen={m.openTrailer}
      empty={empty('remolque', 'remolques')}
    />
  );
  const drivers = (
    <List<DriverDto>
      m={m}
      device={device}
      caption="Choferes"
      rows={m.shown.drivers}
      changed={m.changed.drivers}
      columns={[
        { key: 'nombre', header: 'Nombre', cell: (d) => d.fullName, sortable: true, sortValue: (d) => d.fullName },
        { key: 'carne', header: 'Carné', cell: (d) => d.nationalId },
        { key: 'licencia', header: 'Licencia', cell: (d) => d.licenseNo },
      ]}
      title={(d) => d.fullName}
      detail={(d) => `Carné ${d.nationalId}`}
      onOpen={m.openDriver}
      empty={empty('chofer', 'choferes')}
    />
  );
  const tabs = [
    { id: 'trucks', label: `Camiones (${m.trucks.length})`, content: trucks },
    { id: 'trailers', label: `Remolques (${m.trailers.length})`, content: trailers },
    { id: 'drivers', label: `Choferes (${m.drivers.length})`, content: drivers },
  ];
  const toolbar = (
    <div className="catalog-filters">
      <label className="ui-field">
        <span>Transportista</span>
        <Select
          value={m.carrierFilter}
          onValueChange={m.setCarrierFilter}
          options={[{ value: '', label: 'Todos' }, ...m.carriers.map((c) => ({ value: c.id, label: c.name }))]}
        />
      </label>
      <label className="ui-field">
        <span>{SEARCH[m.tab]}</span>
        <TextField
          type="search"
          autoComplete="off"
          value={m.search}
          onValueChange={m.setSearch}
          {...(m.tab === 'drivers'
            ? { digitsOnly: true, inputMode: 'numeric' as const, maxLength: 11 }
            : { uppercase: true })}
        />
      </label>
    </div>
  );
  const NEW = {
    trucks: ['Nuevo camión', () => m.openTruck(null)],
    trailers: ['Nuevo remolque', () => m.openTrailer(null)],
    drivers: ['Nuevo chofer', () => m.openDriver(null)],
  } as const;
  const [newLabel, onNew] = NEW[m.tab];
  const p = m.panel;
  const title = !p
    ? null
    : p.kind === 'truck'
      ? (p.item?.plate ?? 'Nuevo camión')
      : p.kind === 'trailer'
        ? (p.item?.plate ?? 'Nuevo remolque')
        : (p.item?.fullName ?? 'Nuevo chofer');
  const form = !p ? null : p.kind === 'truck' ? (
    <TruckForm m={m} device={device} />
  ) : p.kind === 'trailer' ? (
    <TrailerForm m={m} />
  ) : (
    <DriverForm m={m} />
  );
  return (
    <CatalogLayout
      device={device}
      toolbar={toolbar}
      list={<Tabs label="Flota" tabs={tabs} value={m.tab} onChange={(id) => m.setTab(id as FleetTab)} />}
      newLabel={newLabel}
      onNew={onNew}
      canEdit={m.canEdit}
      offlineReason={m.offlineReason}
      notice={m.notice}
      panelTitle={title}
      panel={form}
      onClose={m.close}
      emptyDetail="Elija un camión, un remolque o un chofer para ver sus datos."
      dialogs={<MoveDialog m={m} />}
    />
  );
}
