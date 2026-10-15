// T038 · P-02: los pasos del asistente, iguales en las tres clases; cada presentación los coloca en su marco.
import { Lock } from 'lucide-react';
import { Button, Checkbox, TextField } from '../../ui/controls';
import { ErrorSummary, Field } from '../../ui/form';
import { maskPhone } from '../../ui/masks';
import { Notice, Skeleton } from '../../ui/presentation';
import { SETUP_STEPS, type SetupModel } from './useSetup';

/** TAB y ESC: los pasos a la izquierda. */
export function SetupSteps({ model }: { model: SetupModel }) {
  return (
    <ol className="auth-steps" aria-label="Pasos del primer arranque">
      {SETUP_STEPS.map((label, i) => (
        <li
          key={label}
          aria-current={i === model.stepIndex ? 'step' : undefined}
          data-state={i < model.stepIndex ? 'done' : undefined}
        >
          <b aria-hidden="true">{i + 1}</b>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function SetupStep({ model }: { model: SetupModel }) {
  if (model.step === 'checking') return <Skeleton lines={6} />;
  if (model.step === 'codes') return <RecoveryCodes model={model} />;
  return (
    <form className="auth-form" onSubmit={model.submit} noValidate>
      {model.notice && <Notice tone="bad">{model.notice}</Notice>}
      <ErrorSummary errors={model.summary} />
      {model.step === 'data' ? (
        <>
          <h1 className="auth-title">Datos de la primera Apoderada</h1>
          <p className="auth-text">Será quien cree a los demás usuarios. Más adelante puede haber varias Apoderadas.</p>
          <Field label="Nombre y apellidos" {...model.fullName.state}>
            <TextField autoComplete="name" {...model.fullName.control} />
          </Field>
          <Field label="Usuario" help="Con este nombre entrará al sistema" {...model.username.state}>
            <TextField autoComplete="username" autoCapitalize="none" {...model.username.control} />
          </Field>
          <Field label="Carné de identidad" help="11 dígitos" exacting {...model.nationalId.state}>
            <TextField inputMode="numeric" digitsOnly maxLength={11} {...model.nationalId.control} />
          </Field>
          <Field label="Teléfono" help="8 dígitos, por ejemplo 52345678" {...model.phone.state}>
            <TextField inputMode="tel" mask={maskPhone} {...model.phone.control} />
          </Field>
          <Field id="setup-role" label="Rol" help="La primera usuaria siempre es Apoderada">
            <TextField id="setup-role" aria-describedby="setup-role-msg" value="Apoderada" readOnly />
          </Field>
          <Button onClick={model.next}>Continuar</Button>
        </>
      ) : (
        <>
          <h1 className="auth-title">Contraseña</h1>
          <Field label="Contraseña" help="Mínimo 8 caracteres" {...model.password.state}>
            <TextField type="password" autoComplete="new-password" {...model.password.control} />
          </Field>
          <Field label="Confirmar" {...model.confirm.state}>
            <TextField type="password" autoComplete="new-password" {...model.confirm.control} />
          </Field>
          <div className="auth-actions">
            <Button variant="secondary" onClick={model.back} disabled={model.busy}>
              Atrás
            </Button>
            <Button type="submit" busy={model.busy} busyLabel="Creando…">
              Crear Apoderada
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

function RecoveryCodes({ model }: { model: SetupModel }) {
  return (
    <div className="auth-form">
      <h1 className="auth-title">Códigos de recuperación</h1>
      <p className="auth-text">
        <Lock size={14} aria-hidden="true" /> Capturas de pantalla bloqueadas
      </p>
      <p className="auth-text">
        Cópielos a mano y guárdelos. Cada uno sirve una sola vez para recuperar la contraseña. No se volverán a mostrar.
      </p>
      <ul className="auth-codes" aria-label="Códigos de recuperación">
        {model.codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      {model.notice && <Notice tone="bad">{model.notice}</Notice>}
      <Checkbox label="Los copié a mano" checked={model.copied} onChange={model.setCopied} />
      <Button
        onClick={model.finish}
        busy={model.finishing}
        busyLabel="Entrando…"
        {...(model.copied ? {} : { disabledReason: 'Marque «Los copié a mano» para continuar.' })}
      >
        Terminar y entrar
      </Button>
    </div>
  );
}
