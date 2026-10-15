// T038 · P-04: el contenido de la pantalla, igual en las tres clases; cada presentación lo coloca en su marco.
import { Link } from 'react-router';
import { Button, TextField } from '../../ui/controls';
import { ErrorSummary, Field } from '../../ui/form';
import { maskPhone } from '../../ui/masks';
import { Notice } from '../../ui/presentation';
import type { RecoverModel } from './useRecover';

export function RecoverForm({ model }: { model: RecoverModel }) {
  if (model.done)
    return (
      <>
        <h1 className="auth-title">Contraseña cambiada</h1>
        <Notice tone="info">Ya puede entrar con la nueva contraseña. El código usado ya no sirve.</Notice>
        <Link className="auth-link" to="/login" replace>
          Ir a iniciar sesión
        </Link>
      </>
    );
  return (
    <form className="auth-form" onSubmit={model.submit} noValidate>
      <h1 className="auth-title">Recuperar la contraseña</h1>
      {model.notice && <Notice tone="bad">{model.notice}</Notice>}
      <ErrorSummary errors={model.summary} />
      <Field label="Usuario" {...model.username.state}>
        <TextField autoComplete="username" disabled={model.locked} {...model.username.control} />
      </Field>
      <Field label="Carné" exacting {...model.nationalId.state}>
        <TextField inputMode="numeric" digitsOnly maxLength={11} disabled={model.locked} {...model.nationalId.control} />
      </Field>
      <Field label="Teléfono" {...model.phone.state}>
        <TextField inputMode="tel" mask={maskPhone} disabled={model.locked} {...model.phone.control} />
      </Field>
      <Field label="Código de recuperación" help="Uno de los códigos que copió a mano" exacting {...model.code.state}>
        <TextField autoComplete="off" uppercase maxLength={9} disabled={model.locked} {...model.code.control} />
      </Field>
      <Field label="Nueva contraseña" help="Mínimo 8 caracteres" {...model.password.state}>
        <TextField type="password" autoComplete="new-password" disabled={model.locked} {...model.password.control} />
      </Field>
      <Field label="Confirmar" {...model.confirm.state}>
        <TextField type="password" autoComplete="new-password" disabled={model.locked} {...model.confirm.control} />
      </Field>
      <div className="auth-actions">
        <Button type="submit" busy={model.busy} busyLabel="Cambiando…" disabled={model.locked}>
          Cambiar contraseña
        </Button>
      </div>
      <Link className="auth-link" to="/login">
        Volver
      </Link>
    </form>
  );
}
