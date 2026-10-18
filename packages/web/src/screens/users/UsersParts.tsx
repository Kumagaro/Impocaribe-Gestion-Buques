// T040 · P-21: formularios, códigos y confirmaciones, iguales en las tres clases; cada presentación decide dónde se
// abren (panel al lado de la tabla en ESC; hoja en TEL; diálogo en TAB).
import type { UserListItem } from '@impocaribe/shared/validation';
import { Lock } from 'lucide-react';
import { Button, Checkbox, PasswordField, Select, TextField } from '../../ui/controls';
import { ErrorSummary, Field } from '../../ui/form';
import { maskPhone } from '../../ui/masks';
import { Dialog } from '../../ui/overlays';
import { Badge, Notice } from '../../ui/presentation';
import { LAST_APODERADA_REASON, lastAccessText, ROLE_OPTIONS, roleLabel, type UsersModel } from './useUsers';

type FieldPair = UsersModel['newFields']['role'];

/** Un botón desactivado con su motivo (sin conexión, RF-CON-06; o una regla, RF-USR-04). */
export const blocked = (reason: string | undefined) => (reason ? { disabledReason: reason } : {});

export function StatusBadge({ user }: { user: UserListItem }) {
  return user.active ? <Badge tone="ok">Activo</Badge> : <Badge tone="mute">Inactivo</Badge>;
}

export const lastAccess = (model: UsersModel, user: UserListItem) => lastAccessText(user.lastAccessAt, model.now);

export function UsersNotice({ model }: { model: UsersModel }) {
  return model.notice ? <Notice tone={model.notice.tone}>{model.notice.text}</Notice> : null;
}

function RoleField({ field, disabledReason }: { field: FieldPair; disabledReason?: string }) {
  const { control } = field;
  return (
    <Field label="Rol" {...field.state} {...(disabledReason ? { help: disabledReason } : {})}>
      <Select
        id={control.id}
        name={control.name}
        value={control.value}
        invalid={control.invalid}
        aria-describedby={control['aria-describedby']}
        disabled={disabledReason !== undefined}
        options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
        onValueChange={control.onValueChange}
      />
    </Field>
  );
}

function PersonFields({ fields }: { fields: UsersModel['newFields'] | UsersModel['editFields'] }) {
  return (
    <>
      <Field label="Nombre y apellidos" {...fields.fullName.state}>
        <TextField autoComplete="off" {...fields.fullName.control} />
      </Field>
      <Field label="Usuario" help="Con este nombre entrará al sistema" {...fields.username.state}>
        <TextField autoComplete="off" autoCapitalize="none" {...fields.username.control} />
      </Field>
      <Field label="Carné de identidad" help="11 dígitos" exacting {...fields.nationalId.state}>
        <TextField inputMode="numeric" digitsOnly maxLength={11} {...fields.nationalId.control} />
      </Field>
      <Field label="Teléfono" help="8 dígitos, por ejemplo 52345678" {...fields.phone.state}>
        <TextField inputMode="tel" mask={maskPhone} {...fields.phone.control} />
      </Field>
    </>
  );
}

export function NewUserForm({ model }: { model: UsersModel }) {
  const f = model.newFields;
  return (
    <form className="users-form" onSubmit={model.submitNew} noValidate>
      {model.newError && <Notice tone="bad">{model.newError}</Notice>}
      <ErrorSummary errors={model.newSummary} />
      <PersonFields fields={f} />
      <RoleField field={f.role} />
      <Field label="Contraseña" help="Mínimo 8 caracteres" {...f.password.state}>
        <PasswordField autoComplete="new-password" {...f.password.control} />
      </Field>
      <Field label="Confirmar" {...f.confirm.state}>
        <PasswordField autoComplete="new-password" {...f.confirm.control} />
      </Field>
      <div className="users-actions">
        <Button variant="ghost" onClick={model.close}>
          Cancelar
        </Button>
        <Button type="submit" busy={model.creating} busyLabel="Creando…" {...blocked(model.offlineReason)}>
          Crear usuario
        </Button>
      </div>
    </form>
  );
}

export function EditUserForm({ model, user }: { model: UsersModel; user: UserListItem }) {
  const f = model.editFields;
  const last = model.isLastApoderada(user);
  return (
    <form className="users-form" onSubmit={model.submitEdit} noValidate>
      {model.editError && <Notice tone="bad">{model.editError}</Notice>}
      <ErrorSummary errors={model.editSummary} />
      <PersonFields fields={f} />
      <RoleField field={f.role} {...(last ? { disabledReason: LAST_APODERADA_REASON } : {})} />
      <div className="users-actions">
        <Button type="submit" busy={model.saving} busyLabel="Guardando…" {...blocked(model.offlineReason)}>
          Guardar
        </Button>
        <Button variant="secondary" onClick={() => model.openReset(user)} {...blocked(model.offlineReason)}>
          Restablecer contraseña
        </Button>
      </div>
      <div className="users-actions">
        {user.active ? (
          <Button
            variant="danger"
            onClick={() => model.askDeactivate(user)}
            {...blocked(model.offlineReason ?? (last ? LAST_APODERADA_REASON : undefined))}
          >
            Desactivar
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => model.activate(user)}
            busy={model.busy === `activar-${user.id}`}
            busyLabel="Activando…"
            {...blocked(model.offlineReason)}
          >
            Activar
          </Button>
        )}
        <Button variant="ghost" onClick={model.close}>
          Cerrar
        </Button>
      </div>
    </form>
  );
}

/** RF-REC-01: los códigos del nuevo usuario, una sola vez y con capturas bloqueadas. */
export function NewUserCodes({ model, name, codes }: { model: UsersModel; name: string; codes: string[] }) {
  return (
    <div className="users-form">
      <p className="users-text">
        <Lock size={14} aria-hidden="true" /> Capturas de pantalla bloqueadas
      </p>
      <p className="users-text">
        Entréguele estos códigos a {name}: le servirán para recuperar la contraseña. Cópielos a mano; no se volverán a
        mostrar.
      </p>
      <ul className="auth-codes" aria-label="Códigos de recuperación">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Checkbox label="Los copié a mano" checked={model.copied} onChange={model.setCopied} />
      <div className="users-actions">
        <Button
          onClick={model.close}
          {...(model.copied ? {} : { disabledReason: 'Marque «Los copié a mano» para continuar.' })}
        >
          Listo
        </Button>
      </div>
    </div>
  );
}

/** Desactivar y restablecer contraseña se confirman en un diálogo en las tres clases. */
export function UsersDialogs({ model }: { model: UsersModel }) {
  const { panel } = model;
  if (panel?.kind === 'codes')
    return (
      <Dialog title={`Códigos de ${panel.name}`} onClose={() => undefined}>
        <NewUserCodes model={model} name={panel.name} codes={panel.codes} />
      </Dialog>
    );
  if (panel?.kind === 'deactivate')
    return (
      <Dialog
        title={`Desactivar a ${panel.user.fullName}`}
        description="No podrá entrar y se cerrarán sus sesiones. Sus datos y lo que registró se conservan."
        onClose={model.close}
        footer={
          <>
            <Button variant="ghost" onClick={model.close}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => model.deactivate(panel.user)}
              busy={model.busy === `desactivar-${panel.user.id}`}
              busyLabel="Desactivando…"
            >
              Desactivar
            </Button>
          </>
        }
      />
    );
  if (panel?.kind === 'reset') {
    const f = model.resetFields;
    return (
      <Dialog
        title={`Restablecer la contraseña de ${panel.user.fullName}`}
        description="Deberá cambiarla al entrar y se cerrarán sus sesiones."
        onClose={model.close}
      >
        <form className="users-form" onSubmit={model.submitReset} noValidate>
          {model.resetError && <Notice tone="bad">{model.resetError}</Notice>}
          <Field label="Contraseña temporal" help="Mínimo 8 caracteres" {...f.password.state}>
            <PasswordField autoComplete="new-password" {...f.password.control} />
          </Field>
          <Field label="Confirmar" {...f.confirm.state}>
            <PasswordField autoComplete="new-password" {...f.confirm.control} />
          </Field>
          <div className="users-actions">
            <Button variant="ghost" onClick={model.close}>
              Cancelar
            </Button>
            <Button type="submit" busy={model.resetting} busyLabel="Restableciendo…">
              Restablecer
            </Button>
          </div>
        </form>
      </Dialog>
    );
  }
  return null;
}

/** El título del panel de alta o edición. */
export function panelTitle(model: UsersModel): string | null {
  if (model.panel?.kind === 'new') return 'Nuevo usuario';
  if (model.panel?.kind === 'edit') return model.panel.user.fullName;
  return null;
}

export { roleLabel };
