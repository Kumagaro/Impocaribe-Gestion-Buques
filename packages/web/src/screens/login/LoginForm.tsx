// T038 · P-03: el contenido de la pantalla, igual en las tres clases; cada presentación lo coloca en su marco.
import { Link } from 'react-router';
import { Button, Checkbox, PasswordField, TextField } from '../../ui/controls';
import { Field } from '../../ui/form';
import { Notice, Skeleton } from '../../ui/presentation';
import type { LoginModel } from './useLogin';

export function LoginForm({ model }: { model: LoginModel }) {
  if (model.phase === 'checking') return <Skeleton lines={4} />;
  if (model.phase === 'notConfigured')
    return (
      <>
        <Notice tone="info">El sistema aún no está configurado: créelo desde la PC servidor.</Notice>
        <Button variant="secondary" onClick={model.recheck}>
          Volver a comprobar
        </Button>
      </>
    );
  return (
    <form className="auth-form" onSubmit={model.submit} noValidate>
      {model.notice && <Notice tone="bad">{model.notice}</Notice>}
      <Field label="Usuario" {...model.username.state}>
        <TextField autoComplete="username" disabled={model.locked} {...model.username.control} />
      </Field>
      <Field label="Contraseña" {...model.password.state}>
        <PasswordField autoComplete="current-password" disabled={model.locked} {...model.password.control} />
      </Field>
      <Checkbox
        label="Mantener sesión (30 días)"
        checked={model.keepSignedIn}
        onChange={model.setKeepSignedIn}
        disabled={model.locked}
      />
      <Button type="submit" busy={model.busy} busyLabel="Entrando…" disabled={model.locked}>
        Entrar
      </Button>
      <Link className="auth-link" to="/recuperar">
        ¿Olvidó la contraseña?
      </Link>
      <p className="auth-caption">Conectado a {model.serverName}</p>
    </form>
  );
}
