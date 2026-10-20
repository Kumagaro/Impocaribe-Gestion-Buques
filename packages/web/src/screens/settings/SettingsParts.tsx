// T054 · P-23: los grupos de parámetros, el aviso legal y el código de instalación, iguales en las tres clases; cada
// presentación decide dónde van (maqueta T053).
import type { ReactNode } from 'react';
import { Button, TextField } from '../../ui/controls';
import { ErrorSummary, Field, UnsavedChangesGuard } from '../../ui/form';
import { Modal } from '../../ui/overlays';
import { Notice } from '../../ui/presentation';
import { NETWORK_OPTIONS, NOTICE_MAX, NOTICE_MIN, type SettingsModel } from './useSettings';

/** Un botón desactivado con su motivo (sin conexión, RF-CON-06). */
const blocked = (reason: string | undefined) => (reason ? { disabledReason: reason } : {});

export function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="settings-group" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

export function SettingsNotices({ model }: { model: SettingsModel }) {
  return (
    <>
      {model.notice && <Notice tone={model.notice.tone}>{model.notice.text}</Notice>}
      {model.formError && <Notice tone="bad">{model.formError}</Notice>}
      <ErrorSummary errors={model.summary} />
    </>
  );
}

export function OrdersGroup({ model }: { model: SettingsModel }) {
  const f = model.fields.maxLoadingDaysAhead;
  return (
    <Group id="cfg-ordenes" title="Órdenes">
      <div className="settings-narrow">
        <Field
          label="Días máximos hacia el futuro para la fecha de carga"
          help="Por defecto 7 · de 0 a 30"
          {...f.state}
        >
          <TextField inputMode="numeric" digitsOnly maxLength={2} {...f.control} />
        </Field>
      </div>
    </Group>
  );
}

export function BackupsGroup({ model }: { model: SettingsModel }) {
  const f = model.fields;
  return (
    <Group id="cfg-respaldos" title="Respaldos">
      <div className="settings-three">
        <Field label="Jornada: inicio" help="Por defecto 07:00" {...f.workdayStart.state}>
          <TextField inputMode="numeric" maxLength={5} placeholder="hh:mm" {...f.workdayStart.control} />
        </Field>
        <Field label="Jornada: fin" help="Por defecto 19:00 · después del inicio" {...f.workdayEnd.state}>
          <TextField inputMode="numeric" maxLength={5} placeholder="hh:mm" {...f.workdayEnd.control} />
        </Field>
        <Field label="Hora del respaldo diario" help="Por defecto 20:00" {...f.dailyBackupHour.state}>
          <TextField inputMode="numeric" maxLength={5} placeholder="hh:mm" {...f.dailyBackupHour.control} />
        </Field>
      </div>
      <p className="settings-text">
        Durante la jornada se respalda cada hora; el respaldo diario va además a la carpeta externa.
      </p>
      <Field
        label="Carpeta externa del respaldo diario"
        help="Una carpeta de la PC servidor, normalmente en una memoria USB"
        {...f.externalBackupDir.state}
      >
        <TextField autoComplete="off" placeholder="E:\Respaldos" {...f.externalBackupDir.control} />
      </Field>
    </Group>
  );
}

/** RF-CFG-02: router u hotspot, como dos opciones a la vista (no un desplegable: son solo dos). */
export function NetworkGroup({ model, short = false }: { model: SettingsModel; short?: boolean }) {
  const f = model.fields.networkSetup;
  return (
    <Group id="cfg-red" title="Red">
      <div className="ui-field">
        <span className="settings-label" id={`${f.state.id}-label`}>
          Montaje de red
        </span>
        <div className="settings-seg" role="radiogroup" aria-labelledby={`${f.state.id}-label`}>
          {NETWORK_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={model.network === o.value}
              aria-label={o.label}
              onClick={() => model.setNetwork(o.value)}
            >
              {short ? o.short : o.label}
            </button>
          ))}
        </div>
        <p className="settings-help">
          El elegido al crear el servidor. Con hotspot se avisa al llegar a 8 dispositivos.
        </p>
      </div>
    </Group>
  );
}

/** RF-DM-13: el texto, su contador, la vista previa y la vuelta al texto por defecto. */
export function NoticeEditor({ model }: { model: SettingsModel }) {
  const f = model.fields.deadlineLegalNotice;
  const { control } = f;
  return (
    <div className="settings-notice">
      <Field label="Texto que se muestra junto al plazo de cada DM" {...f.state}>
        <textarea
          id={control.id}
          name={control.name}
          className="ui-input ui-textarea"
          rows={6}
          maxLength={NOTICE_MAX}
          value={control.value}
          aria-invalid={control.invalid || undefined}
          aria-describedby={`${control['aria-describedby']} ${control.id}-count`}
          ref={control.ref as unknown as React.Ref<HTMLTextAreaElement>}
          onBlur={control.onBlur as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
          onChange={(e) => control.onValueChange(e.target.value)}
        />
      </Field>
      <span
        id={`${control.id}-count`}
        className="settings-count"
      >{`${model.noticeText.length} de ${NOTICE_MAX} · mínimo ${NOTICE_MIN}`}</span>
      <section className="settings-preview" aria-labelledby="cfg-vista">
        <h3 id="cfg-vista">Vista previa del aviso</h3>
        <div className="ui-legal">
          <b>Plazo: 12 días restantes</b>
          <span>{model.noticeText}</span>
        </div>
      </section>
      <Button variant="ghost" onClick={model.resetNotice}>
        Volver al texto por defecto
      </Button>
    </div>
  );
}

export function SaveBar({ model }: { model: SettingsModel }) {
  return (
    <div className="settings-save">
      <UnsavedChangesGuard when={model.dirty} />
      <span className="settings-text">Cada cambio queda en la bitácora con el valor anterior y el nuevo.</span>
      <Button type="submit" busy={model.saving} busyLabel="Guardando…" {...blocked(model.offlineReason)}>
        Guardar cambios
      </Button>
    </div>
  );
}

/** RF-CFG-04: el código actual, el nuevo y su confirmación, con la marca de correcto (RF-VAL-09). */
export function CodeForm({ model }: { model: SettingsModel }) {
  const f = model.codeFields;
  return (
    <form className="settings-form" onSubmit={model.submitCode} noValidate>
      <p className="settings-text">
        Lo pide el Administrador de instalación para reparar, actualizar, trasladar o desinstalar el servidor. Guárdelo
        impreso junto a la contraseña de respaldo.
      </p>
      {model.codeError && <Notice tone="bad">{model.codeError}</Notice>}
      <ErrorSummary errors={model.codeSummary} />
      <Field label="Código actual" {...f.currentCode.state}>
        <TextField autoComplete="off" uppercase maxLength={14} {...f.currentCode.control} />
      </Field>
      <Field label="Código nuevo" help="Forma XXXX-XXXX-XXXX, sin 0, O, 1, I ni L" exacting {...f.newCode.state}>
        <TextField autoComplete="off" uppercase maxLength={14} {...f.newCode.control} />
      </Field>
      <Field label="Confirmar el código nuevo" {...f.confirm.state}>
        <TextField autoComplete="off" uppercase maxLength={14} {...f.confirm.control} />
      </Field>
      <div className="settings-actions">
        <Button type="submit" busy={model.changingCode} busyLabel="Cambiando…" {...blocked(model.offlineReason)}>
          Cambiar el código
        </Button>
      </div>
    </form>
  );
}

export function CodeSection({ model }: { model: SettingsModel }) {
  return (
    <Group id="cfg-codigo" title="Código de instalación">
      <CodeForm model={model} />
    </Group>
  );
}

/** TEL: el aviso legal y el código se abren en una hoja. */
export function SettingsDialogs({ model }: { model: SettingsModel }) {
  if (model.panel === 'notice')
    return (
      <Modal
        title="Aviso legal del plazo"
        onClose={model.close}
        footer={
          <Button variant="secondary" onClick={() => void model.closeNotice()}>
            Listo
          </Button>
        }
      >
        <NoticeEditor model={model} />
      </Modal>
    );
  if (model.panel === 'code')
    return (
      <Modal title="Código de instalación" onClose={model.close}>
        <CodeForm model={model} />
      </Modal>
    );
  return null;
}
