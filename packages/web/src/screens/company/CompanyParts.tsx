// T054 · P-22: datos de la empresa, firma, cuño, historial y vista previa, iguales en las tres clases; cada presentación
// decide dónde van (maqueta T053).
import { Lock, Upload } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Button, TextField } from '../../ui/controls';
import { ErrorSummary, Field, UnsavedChangesGuard } from '../../ui/form';
import { Modal } from '../../ui/overlays';
import { Badge, Notice } from '../../ui/presentation';
import type { CompanyModel, PickedImage } from './useCompany';

/** Un botón desactivado con su motivo (sin conexión, RF-CON-06). */
export const blocked = (reason: string | undefined) => (reason ? { disabledReason: reason } : {});

type Ready = Extract<CompanyModel['data'], { status: 'ready' }>;

export function SecureNote() {
  return (
    <p className="company-secure">
      <Lock size={14} aria-hidden="true" /> Capturas de pantalla bloqueadas en esta pantalla
    </p>
  );
}

export function CompanyNotices({ model }: { model: CompanyModel }) {
  return (
    <>
      <UnsavedChangesGuard when={model.dirty} />
      {model.notice && <Notice tone={model.notice.tone}>{model.notice.text}</Notice>}
      {model.missing && <Notice tone="bad">{model.missing}</Notice>}
    </>
  );
}

/** Una tarjeta con título que es una región con nombre (se encuentra por él). */
export function Region({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="company-card" aria-labelledby={id}>
      <div className="company-card__head">
        <h2 id={id}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function CompanyForm({ model }: { model: CompanyModel }) {
  const f = model.companyFields;
  return (
    <form className="company-form" onSubmit={model.submitCompany} noValidate>
      {model.companyError && <Notice tone="bad">{model.companyError}</Notice>}
      <ErrorSummary errors={model.companySummary} />
      <div className="company-two">
        <Field label="Razón social" help="Aparece en la cabecera de cada orden" {...f.legalName.state}>
          <TextField autoComplete="organization" {...f.legalName.control} />
        </Field>
        <Field label="Dirección" {...f.address.state}>
          <TextField autoComplete="street-address" {...f.address.control} />
        </Field>
      </div>
      <div className="company-actions">
        <Button type="submit" busy={model.savingCompany} busyLabel="Guardando…" {...blocked(model.offlineReason)}>
          Guardar
        </Button>
      </div>
    </form>
  );
}

/** TEL: los datos se leen en la tarjeta y se editan en una hoja. */
export function CompanySummary({ model, data }: { model: CompanyModel; data: Ready }) {
  return (
    <Region id="empresa-datos" title="Datos de la empresa">
      <p className="company-text">
        <b>{data.company.legalName ?? 'Sin razón social'}</b>
        <span>{data.company.address ?? 'Sin dirección'}</span>
      </p>
      <Button variant="ghost" onClick={model.openCompany} aria-label="Editar los datos de la empresa">
        Editar
      </Button>
    </Region>
  );
}

const src = (o: { mime: string; image: string }) => `data:${o.mime};base64,${o.image}`;

export function SignatureCard({ model, data }: { model: CompanyModel; data: Ready }) {
  const sig = data.signature.current;
  return (
    <Region
      id="empresa-firma"
      title="Firma oficial"
      aside={sig ? <Badge tone="ok">Cargada</Badge> : <Badge tone="bad">Falta</Badge>}
    >
      <div className="company-image" data-empty={sig ? undefined : 'true'}>
        {sig ? <img src={src(sig)} alt="" /> : <span>PNG o JPG · hasta 2 MB · al menos 300 × 100 px</span>}
      </div>
      {sig && (
        <p className="company-text">
          <b>{sig.representativeName}</b>
          <span>{`Credencial ${sig.credentialNo} · ${sig.position}`}</span>
        </p>
      )}
      <Button variant={sig ? 'secondary' : 'primary'} onClick={model.openSignature} {...blocked(model.offlineReason)}>
        {sig ? 'Reemplazar firma' : 'Cargar la firma'}
      </Button>
    </Region>
  );
}

export function StampCard({ model, data }: { model: CompanyModel; data: Ready }) {
  const stamp = data.stamp.current;
  return (
    <Region
      id="empresa-cuno"
      title="Cuño oficial"
      aside={stamp ? <Badge tone="ok">Cargado</Badge> : <Badge tone="bad">Falta</Badge>}
    >
      <div className="company-image" data-empty={stamp ? undefined : 'true'}>
        {stamp ? <img src={src(stamp)} alt="" /> : <span>PNG o JPG · hasta 2 MB · al menos 300 × 100 px</span>}
      </div>
      <Button variant={stamp ? 'secondary' : 'primary'} onClick={model.openStamp} {...blocked(model.offlineReason)}>
        {stamp ? 'Reemplazar cuño' : 'Cargar el cuño'}
      </Button>
    </Region>
  );
}

export function HistoryCard({ model }: { model: CompanyModel }) {
  return (
    <Region id="empresa-historial" title="Historial de cambios">
      {model.history.length === 0 ? (
        <p className="company-text">Aún no se cargó la firma ni el cuño.</p>
      ) : (
        <ul className="company-history" aria-label="Historial de cambios">
          {model.history.map((h) => (
            <li key={h.id}>
              <span>{h.text}</span>
              <span>{h.when}</span>
            </li>
          ))}
        </ul>
      )}
    </Region>
  );
}

/** Cómo quedan la cabecera, la firma y el cuño en la orden (siempre sobre papel blanco). */
export function DocPreview({ data }: { data: Ready }) {
  const sig = data.signature.current;
  const stamp = data.stamp.current;
  return (
    <section className="company-preview" aria-labelledby="empresa-vista">
      <h2 id="empresa-vista">Vista previa en el documento</h2>
      <p className="company-text">Así aparecen la cabecera, la firma y el cuño en cada orden.</p>
      <div className="company-doc">
        <div className="company-doc__head">
          <b>{data.company.legalName ?? 'Razón social'}</b>
          <span>{data.company.address ?? 'Dirección'}</span>
          <span>ORDEN DE CARGA</span>
        </div>
        <div className="company-doc__lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="company-doc__sign">
          <div>
            {sig ? <img src={src(sig)} alt="Firma oficial" className="company-doc__firma" /> : <i>Sin firma</i>}
            <div className="company-doc__who">
              {sig ? (
                <>
                  {sig.representativeName}
                  <br />
                  {`Credencial ${sig.credentialNo} · ${sig.position}`}
                </>
              ) : (
                'Representante'
              )}
            </div>
          </div>
          {stamp ? <img src={src(stamp)} alt="Cuño oficial" className="company-doc__cuno" /> : <i>Sin cuño</i>}
        </div>
      </div>
    </section>
  );
}

/** F-05: elegir la imagen; su error o aviso aparece en cuanto se elige, con su tamaño. */
function ImagePicker({
  label,
  field,
  picked,
  image,
  onPick,
}: {
  label: string;
  field: CompanyModel['stampField'];
  picked: PickedImage | null;
  image: string;
  onPick: (file: File | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Field label={label} help="PNG o JPG · hasta 2 MB · al menos 300 × 100 px" {...field.state}>
      <div className="company-picker">
        <input
          ref={input}
          id={field.control.id}
          type="file"
          accept="image/png,image/jpeg"
          className="company-file"
          // Invisible: el foco (Tab, o el enlace del resumen de errores) pasa al botón «Elegir imagen».
          tabIndex={-1}
          onFocus={(e) => e.currentTarget.parentElement?.querySelector<HTMLButtonElement>('button')?.focus()}
          aria-describedby={field.control['aria-describedby']}
          aria-invalid={field.control.invalid || undefined}
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        <div className="company-image" data-empty={image ? undefined : 'true'}>
          {image && picked ? (
            <img src={`data:${picked.mime};base64,${image}`} alt="" />
          ) : (
            <span>Sin imagen elegida</span>
          )}
        </div>
        <div className="company-actions">
          <Button variant="ghost" icon={<Upload size={16} aria-hidden="true" />} onClick={() => input.current?.click()}>
            {picked ? 'Elegir otra imagen' : 'Elegir imagen'}
          </Button>
          {picked && (
            <span className="company-meta">{`${picked.name} · ${picked.width} × ${picked.height} px · ${picked.sizeKb} KB`}</span>
          )}
        </div>
      </div>
    </Field>
  );
}

export function CompanyDialogs({ model, data }: { model: CompanyModel; data: Ready }) {
  if (model.panel === 'company')
    return (
      <Modal title="Datos de la empresa" onClose={model.close}>
        <CompanyForm model={model} />
      </Modal>
    );
  if (model.panel === 'signature') {
    const f = model.signatureFields;
    const replacing = data.signature.current !== null;
    return (
      <Modal title={replacing ? 'Reemplazar la firma oficial' : 'Cargar la firma oficial'} onClose={model.close}>
        <form className="company-form" onSubmit={model.submitSignature} noValidate>
          <SecureNote />
          {model.signatureError && <Notice tone="bad">{model.signatureError}</Notice>}
          <ErrorSummary errors={model.signatureSummary} />
          <ImagePicker
            label="Imagen de la firma"
            field={f.image}
            picked={model.picked}
            image={model.signatureImage}
            onPick={(file) => void model.pickSignature(file)}
          />
          <Field label="Representante" help="Nombre que se imprime junto a la firma" {...f.representativeName.state}>
            <TextField autoComplete="off" {...f.representativeName.control} />
          </Field>
          <Field label="No. de credencial" {...f.credentialNo.state}>
            <TextField inputMode="numeric" digitsOnly maxLength={20} {...f.credentialNo.control} />
          </Field>
          <Field label="Cargo" {...f.position.state}>
            <TextField autoComplete="off" {...f.position.control} />
          </Field>
          {replacing && (
            <Notice tone="info">Las órdenes ya emitidas conservan la firma anterior. Las nuevas usarán esta.</Notice>
          )}
          <div className="company-actions">
            <Button type="submit" busy={model.savingSignature} busyLabel="Guardando…" {...blocked(model.offlineReason)}>
              Guardar la firma
            </Button>
            <Button variant="ghost" onClick={model.close}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    );
  }
  if (model.panel === 'stamp') {
    const replacing = data.stamp.current !== null;
    return (
      <Modal title={replacing ? 'Reemplazar el cuño oficial' : 'Cargar el cuño oficial'} onClose={model.close}>
        <form className="company-form" onSubmit={model.submitStamp} noValidate>
          <SecureNote />
          {model.stampError && <Notice tone="bad">{model.stampError}</Notice>}
          <ErrorSummary errors={model.stampSummary} />
          <ImagePicker
            label="Imagen del cuño"
            field={model.stampField}
            picked={model.picked}
            image={model.stampImage}
            onPick={(file) => void model.pickStamp(file)}
          />
          {replacing && (
            <Notice tone="info">Las órdenes ya emitidas conservan el cuño anterior. Las nuevas usarán este.</Notice>
          )}
          <div className="company-actions">
            <Button type="submit" busy={model.savingStamp} busyLabel="Guardando…" {...blocked(model.offlineReason)}>
              Guardar el cuño
            </Button>
            <Button variant="ghost" onClick={model.close}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    );
  }
  return null;
}
