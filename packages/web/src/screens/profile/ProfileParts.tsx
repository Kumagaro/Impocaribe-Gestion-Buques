// T039 · P-05: el contenido de cada sección, igual en las tres clases; cada presentación decide cómo se navega entre
// ellas (lista en TEL; secciones a la izquierda en TAB y ESC).
import { havanaDateTime } from '@impocaribe/shared';
import { ChevronRight, Lock, LogOut, Monitor, Smartphone } from 'lucide-react';
import { Button, Checkbox, PasswordField, Switch } from '../../ui/controls';
import { ErrorSummary, Field } from '../../ui/form';
import { Dialog } from '../../ui/overlays';
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from '../../ui/presentation';
import type { ThemePreference } from '../../ui/tokens';
import { PROFILE_SECTIONS, type ProfileModel, type ProfileSection } from './useProfile';

/** Un botón desactivado con su motivo (sin conexión, RF-CON-06). */
const blocked = (reason: string | undefined) => (reason ? { disabledReason: reason } : {});

const THEMES: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'Del sistema' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
];
export const themeLabel = (theme: ThemePreference) => THEMES.find((t) => t.id === theme)!.label;
export const sectionLabel = (id: ProfileSection) => PROFILE_SECTIONS.find((s) => s.id === id)!.label;

export function ProfileUser({ model }: { model: ProfileModel }) {
  return (
    <div className="profile-user">
      <b>{model.user.name}</b>
      <span>
        {model.user.username} · {model.user.role}
      </span>
    </div>
  );
}

export function ProfileNotice({ model }: { model: ProfileModel }) {
  return (
    <>
      {model.mustChange && (
        <Notice tone="warn">Entró con una contraseña temporal: cámbiela para poder usar la app.</Notice>
      )}
      {model.notice && <Notice tone={model.notice.tone}>{model.notice.text}</Notice>}
    </>
  );
}

export function SignOutButton({ model }: { model: ProfileModel }) {
  return (
    <Button
      variant="ghost"
      icon={<LogOut size={18} aria-hidden="true" />}
      onClick={model.signOut}
      busy={model.busy === 'salir'}
      busyLabel="Cerrando sesión…"
    >
      Cerrar sesión
    </Button>
  );
}

/** TEL: la lista de secciones, cada una abre su pantalla. */
export function ProfileList({ model }: { model: ProfileModel }) {
  const item = (id: ProfileSection, label: string, aside?: string | number | null) => (
    <li key={id}>
      <button type="button" className="profile-row" onClick={() => model.open(id)}>
        <span>{label}</span>
        {aside !== undefined && aside !== null && <span className="profile-row__aside">{aside}</span>}
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </li>
  );
  return (
    <ul className="profile-list" aria-label="Secciones del perfil">
      {item('datos', 'Datos')}
      {item('sesiones', 'Sesiones abiertas', model.sessionCount)}
      {item('contrasena', 'Cambiar contraseña')}
      {item('codigos', 'Códigos de recuperación')}
      {item('apariencia', 'Tema', themeLabel(model.theme))}
      <li>
        <div className="profile-row">
          <Switch label="Reducir animaciones" checked={model.reduceMotion} onChange={model.setReduceMotion} />
        </div>
      </li>
    </ul>
  );
}

export function ProfileSectionBody({ model, section }: { model: ProfileModel; section: ProfileSection }) {
  switch (section) {
    case 'datos':
      return <UserData model={model} />;
    case 'sesiones':
      return <Sessions model={model} />;
    case 'contrasena':
      return <ChangePassword model={model} />;
    case 'codigos':
      return <RecoveryCodes model={model} />;
    case 'apariencia':
      return <Appearance model={model} />;
  }
}

function UserData({ model }: { model: ProfileModel }) {
  return (
    <dl className="profile-data">
      <dt>Nombre y apellidos</dt>
      <dd>{model.user.name}</dd>
      <dt>Usuario</dt>
      <dd>{model.user.username}</dd>
      <dt>Rol</dt>
      <dd>{model.user.role}</dd>
      <dt>Teléfono</dt>
      <dd>{model.user.phone}</dd>
    </dl>
  );
}

function Sessions({ model }: { model: ProfileModel }) {
  const { sessions } = model;
  if (sessions.status === 'loading') return <Skeleton lines={4} />;
  if (sessions.status === 'error') return <ErrorState message={sessions.message} onRetry={model.reloadSessions} />;
  if (sessions.list.length === 0) return <EmptyState title="No hay sesiones abiertas" />;
  const others = sessions.list.filter((s) => !s.current).length;
  return (
    <>
      {others > 0 && (
        <div className="profile-actions">
          <Button
            variant="secondary"
            onClick={model.closeOthers}
            busy={model.busy === 'cerrar-demas'}
            busyLabel="Cerrando…"
            {...blocked(model.offlineReason)}
          >
            Cerrar las demás sesiones
          </Button>
        </div>
      )}
      <ul className="profile-sessions" aria-label="Sesiones abiertas">
        {sessions.list.map((s) => (
          <li key={s.id}>
            {s.platform === 'android' ? <Smartphone aria-hidden="true" /> : <Monitor aria-hidden="true" />}
            <div>
              <b>
                {s.deviceLabel} · {s.platform === 'android' ? 'Android' : 'Windows'}
              </b>
              <span>
                Desde el {havanaDateTime(new Date(s.createdAt))} · vence el {havanaDateTime(new Date(s.expiresAt))}
              </span>
            </div>
            {s.current ? (
              <Badge tone="ok">Esta sesión</Badge>
            ) : (
              <Button
                variant="ghost"
                onClick={() => model.closeSession(s.id)}
                busy={model.busy === `cerrar-${s.id}`}
                busyLabel="Cerrando…"
                {...blocked(model.offlineReason)}
              >
                Cerrar
              </Button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function ChangePassword({ model }: { model: ProfileModel }) {
  return (
    <form className="profile-form" onSubmit={model.submitPassword} noValidate>
      {model.passwordError && <Notice tone="bad">{model.passwordError}</Notice>}
      <ErrorSummary errors={model.passwordSummary} />
      <Field label="Contraseña actual" {...model.current.state}>
        <PasswordField autoComplete="current-password" {...model.current.control} />
      </Field>
      <Field label="Nueva contraseña" help="Mínimo 8 caracteres" {...model.password.state}>
        <PasswordField autoComplete="new-password" {...model.password.control} />
      </Field>
      <Field label="Confirmar" {...model.confirm.state}>
        <PasswordField autoComplete="new-password" {...model.confirm.control} />
      </Field>
      <div className="profile-actions">
        <Button type="submit" busy={model.changingPassword} busyLabel="Cambiando…" {...blocked(model.offlineReason)}>
          Cambiar contraseña
        </Button>
      </div>
    </form>
  );
}

function RecoveryCodes({ model }: { model: ProfileModel }) {
  if (model.codes)
    return (
      <div className="profile-form">
        <p className="profile-text">
          <Lock size={14} aria-hidden="true" /> Capturas de pantalla bloqueadas
        </p>
        <p className="profile-text">
          Cópielos a mano y guárdelos. Cada uno sirve una sola vez. Los anteriores ya no sirven y estos no se volverán a
          mostrar.
        </p>
        <ul className="auth-codes" aria-label="Códigos de recuperación">
          {model.codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <Checkbox label="Los copié a mano" checked={model.copied} onChange={model.setCopied} />
        <div className="profile-actions">
          <Button
            onClick={model.closeCodes}
            {...(model.copied ? {} : { disabledReason: 'Marque «Los copié a mano» para continuar.' })}
          >
            Listo
          </Button>
        </div>
      </div>
    );
  return (
    <div className="profile-form">
      <p className="profile-text">
        Los códigos sirven para recuperar la contraseña si la olvida. Si genera códigos nuevos, los anteriores dejan de
        servir.
      </p>
      <div className="profile-actions">
        <Button
          variant="secondary"
          onClick={model.askRegenerate}
          busy={model.busy === 'codigos'}
          busyLabel="Generando…"
          {...blocked(model.offlineReason)}
        >
          Generar códigos nuevos
        </Button>
      </div>
      {model.confirmRegenerate && (
        <Dialog
          title="¿Generar códigos nuevos?"
          description="Los 8 códigos que tiene ahora dejarán de servir."
          onClose={model.cancelRegenerate}
          footer={
            <>
              <Button variant="ghost" onClick={model.cancelRegenerate}>
                Cancelar
              </Button>
              <Button onClick={model.regenerate}>Generar</Button>
            </>
          }
        />
      )}
    </div>
  );
}

function Appearance({ model }: { model: ProfileModel }) {
  return (
    <div className="profile-form">
      <div className="profile-themes" role="radiogroup" aria-label="Tema">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={model.theme === t.id}
            onClick={() => model.setTheme(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Switch
        label="Reducir animaciones (solo en este dispositivo)"
        checked={model.reduceMotion}
        onChange={model.setReduceMotion}
      />
    </div>
  );
}
