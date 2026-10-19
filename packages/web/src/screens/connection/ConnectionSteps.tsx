// T038 · P-01: un paso por vez (Buscando → Encontrado → Código → Listo), igual en las tres clases; cada presentación
// lo coloca en su marco.
import { serverName } from '@impocaribe/shared';
import { ShieldCheck } from 'lucide-react';
import { AnimatedIcon } from '../../motion/AnimatedIcon';
import { useReducedMotionPreference } from '../../motion/MotionProvider';
import { Button, TextField } from '../../ui/controls';
import { Field } from '../../ui/form';
import type { FoundServer } from '../../connection/discovery';
import type { DiscoveryMethod } from '../../platform/platform';
import { Notice } from '../../ui/presentation';
import { DISCOVERY_STEPS, shortIdentity, type ConnectionModel } from './useConnection';

const METHOD_TEXT: Record<DiscoveryMethod, string> = {
  last: 'la última dirección',
  dnssd: 'el anuncio en la red',
  broadcast: 'la difusión',
  subnet: 'la red local',
  manual: 'la dirección escrita',
  qr: 'el QR',
};

function ServerBox({ server, detail }: { server: FoundServer; detail: string }) {
  return (
    <div className="auth-server">
      <ShieldCheck size={28} aria-hidden="true" />
      <div>
        <b>{serverName(server.serverId)}</b>
        <span>
          {detail} · {server.address}
        </span>
      </div>
    </div>
  );
}

function Alternatives({ model }: { model: ConnectionModel }) {
  return (
    <>
      {model.canScan && (
        <Button variant="secondary" onClick={model.scan} busy={model.busy}>
          Escanear QR del servidor
        </Button>
      )}
      <button type="button" className="auth-link" aria-expanded={model.advanced} onClick={model.toggleAdvanced}>
        Opciones avanzadas
      </button>
      {model.advanced && (
        <form className="auth-form" onSubmit={model.submitAddress} noValidate>
          <Field label="Dirección" help="Por ejemplo 192.168.1.10 o 192.168.1.10:8443" {...model.address.state}>
            <TextField inputMode="url" autoCapitalize="none" autoComplete="off" {...model.address.control} />
          </Field>
          <Button type="submit" variant="secondary" busy={model.probing} busyLabel="Conectando…">
            Conectar
          </Button>
        </form>
      )}
    </>
  );
}

export function ConnectionStep({ model }: { model: ConnectionModel }) {
  const reduced = useReducedMotionPreference();
  const { phase } = model;
  const notice = model.notice && <Notice tone="bad">{model.notice}</Notice>;

  if (phase.kind === 'searching') {
    const current = DISCOVERY_STEPS.findIndex((s) => s.method === phase.method);
    return (
      <>
        <h1 className="auth-title">Buscando el servidor</h1>
        <p className="auth-text">
          Conecte este dispositivo a la misma red que la PC servidor. No hace falta escribir nada.
        </p>
        {notice}
        <div className="auth-search" data-reduced={reduced || undefined} aria-hidden="true" />
        <ul className="auth-methods" aria-label="Métodos de búsqueda">
          {DISCOVERY_STEPS.map((s, i) => (
            <li
              key={s.method}
              data-state={i < current ? 'done' : i === current ? 'now' : undefined}
              aria-current={i === current ? 'step' : undefined}
            >
              {s.label}
            </li>
          ))}
        </ul>
        <Alternatives model={model} />
      </>
    );
  }

  if (phase.kind === 'notFound')
    return (
      <>
        <h1 className="auth-title">No se encontró el servidor</h1>
        {notice}
        <p className="auth-text">Se probaron todos los métodos sin respuesta.</p>
        <ul className="auth-text">
          <li>Compruebe que la PC servidor está encendida.</li>
          <li>Conéctese a la misma red wifi que ella.</li>
          <li>Si usa el hotspot de un celular, revise que esté activo.</li>
        </ul>
        <Button onClick={model.search}>Volver a buscar</Button>
        <Button variant="secondary" onClick={model.openDiagnostics}>
          Abrir el Diagnóstico de red
        </Button>
        <Alternatives model={model} />
      </>
    );

  if (phase.kind === 'found')
    return (
      <>
        <h1 className="auth-title">Servidor encontrado</h1>
        {notice}
        <ServerBox server={phase.server} detail={`Encontrado por ${METHOD_TEXT[phase.server.method]}`} />
        <p className="auth-text">Este dispositivo aún no está emparejado. Se empareja una sola vez.</p>
        <Button onClick={model.pairWithCode} busy={model.busy} busyLabel="Pidiendo el código…">
          Emparejar con código
        </Button>
        <Alternatives model={model} />
      </>
    );

  if (phase.kind === 'code')
    return (
      <>
        <h1 className="auth-title">Confirme este código en la pantalla del servidor</h1>
        <ServerBox server={phase.server} detail={`Identidad ${shortIdentity(phase.server.caFingerprint)}`} />
        <p className="auth-code" aria-label={`Código ${phase.code.split('').join(' ')}`}>
          {phase.code.slice(0, 3)} {phase.code.slice(3)}
        </p>
        <p className="auth-countdown">El código caduca en {model.countdown}</p>
        <p className="auth-text">Quien esté ante la PC servidor debe ver el mismo código y pulsar «Confirmar».</p>
        <Notice tone="warn">
          Si los códigos no coinciden, no confirme: otro equipo podría estar haciéndose pasar por el servidor.
        </Notice>
        <Button variant="secondary" onClick={model.cancel}>
          Cancelar
        </Button>
      </>
    );

  return (
    <>
      <AnimatedIcon name="check" state="draw" label="Emparejado" size={48} />
      <h1 className="auth-title">Emparejado con {phase.name}</h1>
      <p className="auth-text">Ya no hace falta repetirlo: este dispositivo encontrará el servidor solo.</p>
      <Button onClick={model.goLogin}>Iniciar sesión</Button>
    </>
  );
}
