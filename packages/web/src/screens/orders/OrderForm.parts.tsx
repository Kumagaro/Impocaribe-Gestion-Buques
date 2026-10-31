// T086 y T089 · P-13 Nueva orden y P-16 Corregir: el formulario de F-14, el panel de saldo con sus comprobaciones, la
// vista previa A4, la excepción y la orden emitida (ui-spec y maqueta T085). En TEL, cuatro pasos con el saldo arriba.
import { Lock } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, TextField, TonsInput } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { ErrorSummary, Field } from '../../ui/form';
import { Modal, OverrideDialog } from '../../ui/overlays';
import { Notice } from '../../ui/presentation';
import { Stepper } from '../../ui/structure';
import { blocked } from '../catalogs/CatalogLayout';
import { selectOf } from '../catalogs/Fleet.parts';
import { dateText, tonsText } from '../declarations/useDeclarations';
import { DocumentPreview, type PreviewData } from './DocumentPreview';
import type { OrderFormModel } from './useOrderForm';

export const STEPS = ['DM y destino', 'Camión y chofer', 'Carga', 'Revisión'];

/** Lo que se lleva escrito, como documento (sin número ni firma: los pone el servidor al emitir). */
export function previewOf(m: OrderFormModel): PreviewData {
  const v = m.values;
  return {
    number: m.fixing?.number ?? null,
    issueDate: m.today,
    versionNo: m.fixing ? m.fixing.current.versionNo + 1 : 1,
    internalBuyer: m.vessel?.internalBuyer ?? '',
    port: m.vessel?.port ?? '',
    loadingDate: String(v.loadingDate ?? ''),
    product: 'Harina de trigo',
    container: String(v.container ?? '').toUpperCase() || null,
    tons: String(v.tons ?? '').replace(',', '.'),
    vesselName: m.vessel?.name ?? '',
    manifest: m.vessel?.manifest ?? '',
    bl: m.vessel?.bl ?? '',
    declarationNumber: m.declaration?.number ?? '',
    clientName: m.client?.name ?? '',
    brand: m.declaration?.brand ?? '',
    recipientName: m.recipient?.name ?? '',
    recipientAddress: m.recipient?.address ?? '',
    carrierName: m.truck ? m.carrierName(m.truck.carrierId) : '',
    truckPlate: m.truck?.plate ?? '',
    tractorPlate: m.truck?.tractorPlate ?? null,
    trailerPlates: m.trailerChoices.filter((t) => m.trailerIds.includes(t.id)).map((t) => t.plate),
    lotNo: String(v.lotNo ?? '') || null,
    routeSheetNo: String(v.routeSheetNo ?? '') || null,
    waybillNo: String(v.waybillNo ?? '').toUpperCase(),
    baseLocation: m.truck?.baseLocation ?? '',
    driverName: m.driver?.fullName ?? '',
    driverNationalId: m.driver?.nationalId ?? '',
    driverLicenseNo: m.driver?.licenseNo ?? '',
    representativeName: '(representante de la firma oficial vigente)',
    credentialNo: '',
    position: '',
  };
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="order-form" aria-label={title}>
      {children}
    </section>
  );
}

function DmFields({ m }: { m: OrderFormModel }) {
  const f = m.fields;
  if (m.fixing)
    return (
      <p className="dm-row catalog-text">
        <Lock size={14} aria-hidden="true" />
        {`DM ${m.declaration?.number ?? ''} · buque ${m.vessel?.name ?? ''} · no cambian: para eso, anule y cree otra orden`}
      </p>
    );
  return (
    <div className="order-cols">
      <Field label="DM" {...f.declarationId.state}>
        {selectOf(f.declarationId.control, m.declarationOptions, 'Elija la DM')}
      </Field>
      <Field label="Buque" {...f.allocationId.state}>
        {selectOf(f.allocationId.control, m.allocationOptions, 'Elija el buque')}
      </Field>
    </div>
  );
}

function AutoData({ m }: { m: OrderFormModel }) {
  if (!m.declaration) return null;
  return (
    <p className="order-auto" aria-label="Lo trae el sistema">
      <span className="order-auto__tag">Lo trae el sistema</span>
      <span>
        Cliente: <b>{m.client?.name}</b> · Marca <b>{m.declaration.brand}</b>
      </span>
      {m.vessel && (
        <span>
          Manifiesto <b>{m.vessel.manifest}</b> · B/L <b>{m.vessel.bl}</b> · Puerto <b>{m.vessel.port}</b>
        </span>
      )}
      {m.recipient && (
        <span>
          Dirección: <b>{m.recipient.address}</b>
        </span>
      )}
    </p>
  );
}

function DestinationFields({ m }: { m: OrderFormModel }) {
  const f = m.fields;
  return (
    <>
      <DmFields m={m} />
      <Field label="Destinatario" {...f.recipientId.state}>
        {selectOf(f.recipientId.control, m.recipientOptions, 'Elija el destinatario')}
      </Field>
      <AutoData m={m} />
    </>
  );
}

function VehicleFields({ m }: { m: OrderFormModel }) {
  const f = m.fields;
  return (
    <>
      <div className="order-cols">
        <Field label="Transportista" help="Filtra los camiones y choferes" {...f.carrierId.state}>
          {selectOf(f.carrierId.control, m.carrierOptions, 'Elija el transportista')}
        </Field>
        <Field label="Camión" {...f.truckId.state}>
          {selectOf(f.truckId.control, m.truckOptions, 'Elija el camión')}
        </Field>
        <Field
          label="Chofer"
          {...(m.driver ? { help: `Carné ${m.driver.nationalId} · Licencia ${m.driver.licenseNo}` } : {})}
          {...f.driverId.state}
        >
          {selectOf(f.driverId.control, m.driverOptions, 'Elija el chofer')}
        </Field>
      </div>
      <div className="order-form" style={{ gap: 6 }}>
        <span className="catalog-title" style={{ fontSize: 14 }} id="orden-remolques">
          Remolques
        </span>
        {m.trailersError && <Notice tone="bad">{m.trailersError}</Notice>}
        <ul className="catalog-chips" aria-labelledby="orden-remolques">
          {m.trailerChoices.map((t) => (
            <li key={t.id}>
              <button type="button" aria-pressed={m.trailerIds.includes(t.id)} onClick={() => m.toggleTrailer(t.id)}>
                {`${t.plate} · ${tonsText(t.capacityTons)}`}
              </button>
            </li>
          ))}
        </ul>
        <p className="catalog-text">{`Capacidad total: ${m.panel.capacity}`}</p>
      </div>
    </>
  );
}

function LoadFields({ m }: { m: OrderFormModel }) {
  const f = m.fields;
  return (
    <>
      <div className="order-cols">
        <Field label="Toneladas" help={`Saldo: ${m.panel.balance} · Capacidad: ${m.panel.capacity}`} {...f.tons.state}>
          <TonsInput {...f.tons.control} />
        </Field>
        <Field label="Carta de porte" exacting {...f.waybillNo.state}>
          <TextField uppercase autoComplete="off" {...f.waybillNo.control} />
        </Field>
        <Field
          label="Fecha de carga"
          {...(m.fixing
            ? { help: `Desde la emisión de la versión 1 (${dateText(m.fixing.firstIssuedAt.slice(0, 10))})` }
            : {})}
          {...f.loadingDate.state}
        >
          <TextField type="date" {...f.loadingDate.control} />
        </Field>
      </div>
      <div className="order-cols">
        <Field label="LOT" {...f.lotNo.state}>
          <TextField autoComplete="off" {...f.lotNo.control} />
        </Field>
        <Field label="Hoja de ruta" {...f.routeSheetNo.state}>
          <TextField autoComplete="off" {...f.routeSheetNo.control} />
        </Field>
        <Field label="Contenedor" help="Vacío si es carga suelta" {...f.container.state}>
          <TextField uppercase autoComplete="off" {...f.container.control} />
        </Field>
      </div>
      {m.fixing && (
        <Field label="Motivo" help="Queda registrado en la bitácora." {...f.reason.state}>
          <TextField autoComplete="off" {...f.reason.control} />
        </Field>
      )}
    </>
  );
}

export function BalancePanel({ m }: { m: OrderFormModel }) {
  return (
    <aside className="order-panel" aria-label="Saldo de la asignación">
      <b>Saldo de la asignación</b>
      <dl>
        <dt>Saldo</dt>
        <dd>{m.panel.balance}</dd>
        <dt>Esta orden</dt>
        <dd>{m.panel.thisOrder}</dd>
        <dt>Quedaría</dt>
        <dd {...(m.panel.overdraft ? { 'data-bad': '' } : {})}>{m.panel.after}</dd>
        <dt>Capacidad</dt>
        <dd>{m.panel.capacity}</dd>
      </dl>
      {m.checks.length > 0 && (
        <ul className="order-checks" aria-label="Comprobaciones" aria-live="polite">
          {m.checks.map((c, i) => (
            <li key={i} data-tone={c.tone}>
              {c.text}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export interface OrderFormActions {
  /** P-13: «Guardar borrador» (lo comparte). */
  onShare?: () => void;
  onCancel: () => void;
  savedAt?: string | null;
}

export function OrderFormView({
  m,
  device,
  actions,
}: {
  m: OrderFormModel;
  device: DeviceClass;
  actions: OrderFormActions;
}) {
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(false);
  const steps = device === 'phone';
  const emitLabel = m.fixing ? `Emitir la versión ${m.fixing.current.versionNo + 1}` : 'Emitir';
  const emit = (
    <Button
      type="submit"
      busy={m.saving || m.busy === 'emitir'}
      busyLabel="Emitiendo…"
      {...blocked(m.offlineReason ?? m.blocking?.message)}
    >
      {emitLabel}
    </Button>
  );
  const buttons = (
    <div className="catalog-actions">
      {actions.onShare && (
        <Button
          variant="secondary"
          onClick={actions.onShare}
          busy={m.busy === 'borrador'}
          {...blocked(m.offlineReason)}
        >
          Guardar borrador
        </Button>
      )}
      <Button variant="secondary" onClick={() => setPreview(true)}>
        Revisar
      </Button>
      {emit}
      <Button variant="ghost" onClick={actions.onCancel}>
        Cancelar
      </Button>
    </div>
  );
  return (
    <form onSubmit={m.submit} noValidate>
      {m.notice && <Notice tone={m.notice.tone}>{m.notice.text}</Notice>}
      {m.formError && <Notice tone="bad">{m.formError}</Notice>}
      <ErrorSummary errors={m.summary} />
      {steps ? (
        <div className="order-form">
          <p className="dm-row catalog-text" aria-label="Saldo">
            <span>{`Saldo ${m.panel.balance}`}</span>
            <span>{`Quedaría ${m.panel.after}`}</span>
          </p>
          <Stepper steps={STEPS} current={step} />
          {step === 0 && <DestinationFields m={m} />}
          {step === 1 && <VehicleFields m={m} />}
          {step === 2 && <LoadFields m={m} />}
          {step === 3 && (
            <>
              <BalancePanel m={m} />
              <div className="order-paper-wrap">
                <DocumentPreview s={previewOf(m)} />
              </div>
            </>
          )}
          <div className="catalog-actions">
            {step < 3 ? <Button onClick={() => setStep(step + 1)}>Siguiente</Button> : emit}
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                Atrás
              </Button>
            )}
            {actions.onShare && step === 3 && (
              <Button variant="secondary" onClick={actions.onShare} {...blocked(m.offlineReason)}>
                Guardar borrador
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="order-grid">
          <div className="order-form">
            <Group title="DM y destino">
              <DestinationFields m={m} />
            </Group>
            <Group title="Camión y chofer">
              <VehicleFields m={m} />
            </Group>
            <Group title="Carga">
              <LoadFields m={m} />
            </Group>
            {actions.savedAt && <p className="catalog-text">Borrador guardado en este dispositivo.</p>}
          </div>
          <div className="order-form">
            <BalancePanel m={m} />
            {buttons}
          </div>
        </div>
      )}
      {preview && (
        <Modal
          title="Revisar el documento"
          onClose={() => setPreview(false)}
          footer={
            <Button variant="ghost" onClick={() => setPreview(false)}>
              Volver
            </Button>
          }
        >
          <div className="order-paper-wrap">
            <DocumentPreview s={previewOf(m)} />
          </div>
        </Modal>
      )}
      {m.override && (
        <OverrideDialog
          title={m.override.title}
          rule={m.override.rule}
          confirmLabel="Emitir con excepción"
          onConfirm={m.confirmOverride}
          onClose={m.cancelOverride}
        />
      )}
    </form>
  );
}

/** Tras emitir (MOV-07): el número, la descarga del original y la siguiente orden. */
export function IssuedView({ m, onAnother, onOpen }: { m: OrderFormModel; onAnother: () => void; onOpen: () => void }) {
  const o = m.issued!;
  return (
    <section className="order-success" aria-live="polite" aria-label="Orden emitida">
      <h2 className="catalog-title">{m.fixing ? `Versión ${o.current.versionNo} emitida` : 'Orden emitida'}</h2>
      <p className="order-success__number">{o.number}</p>
      <p className="catalog-text">{`${tonsText(o.current.tons)} de la DM ${m.declaration?.number ?? ''}`}</p>
      {m.notice && <Notice tone={m.notice.tone}>{m.notice.text}</Notice>}
      <div className="catalog-actions" style={{ justifyContent: 'center' }}>
        <Button onClick={() => m.download(o)} busy={m.busy === 'descargar'} {...blocked(m.offlineReason)}>
          Descargar el original
        </Button>
        {!m.fixing && (
          <Button variant="secondary" onClick={onAnother}>
            Otra orden para esta DM
          </Button>
        )}
        <Button variant="ghost" onClick={onOpen}>
          Ver la orden
        </Button>
      </div>
      <p className="catalog-text">El original sin marca se puede bajar durante 24 horas; después, sale como COPIA.</p>
    </section>
  );
}
