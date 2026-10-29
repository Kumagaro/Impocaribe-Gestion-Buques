// T127 · P-28 en escritorio (ui-spec P-28 y maqueta T124): asistente con los pasos a la izquierda. Solo existe en la PC
// servidor (Const. art. XIV.1, excepción de P-28, P-29 y P-31).
import type { ServerCheck } from '@impocaribe/shared';
import { ShieldCheck, Wifi } from 'lucide-react';
import { Button, PasswordField, TextField } from '../../ui/controls';
import { ErrorSummary, Field } from '../../ui/form';
import { AppLogo } from '../../ui/logo';
import { Notice, ProgressBar, Skeleton } from '../../ui/presentation';
import { QrCode } from '../../ui/qr';
import { minutes, StepList, TechnicalLog } from './SetupParts';
import type { CreateServerModel } from './useCreateServer';

const MARK = { ok: '✓', warn: '!', bad: '✕' } as const;

function Steps({ m }: { m: CreateServerModel }) {
  return (
    <nav className="wizard__nav" aria-label="Pasos">
      <div className="wizard__brand">
        <AppLogo size={32} />
        <div>
          <b>{m.moving ? 'Trasladar el servidor' : 'Crear servidor'}</b>
          <span>Esta PC</span>
        </div>
      </div>
      <ol className="wizard__steps">
        {m.steps.map((s, i) => {
          const state = i < m.stepIndex ? 'done' : i === m.stepIndex ? 'now' : 'next';
          return (
            <li key={s.id} className="wstep" data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
              <b aria-hidden="true">{state === 'done' ? '✓' : i + 1}</b>
              {s.label}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Checks({ checks, searchSeconds }: { checks: ServerCheck[]; searchSeconds: number }) {
  return (
    <ul className="srv-checks" aria-label="Comprobación de esta PC">
      {checks.map((c) => (
        <li key={c.id} data-level={c.level}>
          <span
            className="srv-mark"
            data-level={c.level}
            aria-label={c.level === 'ok' ? 'Cumple' : c.level === 'warn' ? 'Aviso' : 'No cumple'}
          >
            {MARK[c.level]}
          </span>
          <div>
            <b>{c.title}</b>
            <span className="srv-detail">{c.detail}</span>
          </div>
          <small>{c.id === 'server' ? `${searchSeconds} s` : ''}</small>
        </li>
      ))}
    </ul>
  );
}

function Checking({ m }: { m: CreateServerModel }) {
  const blocked = m.checks !== null && !m.canContinue;
  return (
    <>
      <div>
        <h2 className="wizard__title">Comprobación de esta PC</h2>
        <p className="wizard__lead">Esta PC guardará los datos de la empresa y atenderá a todos los dispositivos.</p>
      </div>
      {m.notice && <Notice tone="bad">{m.notice}</Notice>}
      {m.checks === null ? (
        <div role="status" aria-label="Comprobando esta PC">
          <p className="wizard__lead">Buscando otro servidor en la red y comprobando esta PC…</p>
          <Skeleton lines={7} />
        </div>
      ) : (
        <Checks checks={m.checks} searchSeconds={m.searchSeconds} />
      )}
      <div className="srv-foot">
        {m.checks?.some((c) => c.level === 'warn') && !blocked && (
          <span className="srv-foot__left">Una marca ámbar no impide continuar.</span>
        )}
        {blocked ? (
          <>
            <Button variant="ghost" onClick={m.recheck}>
              Volver a comprobar
            </Button>
            <Button variant="secondary" onClick={m.cancel}>
              Volver
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={m.cancel}>
              Cancelar
            </Button>
            <Button disabled={!m.canContinue} onClick={m.toPermissions}>
              Continuar
            </Button>
          </>
        )}
      </div>
    </>
  );
}

function Permissions({ m }: { m: CreateServerModel }) {
  const { control, state } = m.code;
  return (
    <form className="wizard__form" noValidate onSubmit={(e) => void m.submitCode(e)}>
      <div>
        <h2 className="wizard__title">Permisos</h2>
        <p className="wizard__lead">
          Al crear el servidor, Windows le pedirá permiso de administrador. Si no lo tiene, pida ayuda a quien
          administra esta PC.
        </p>
      </div>
      <ErrorSummary errors={m.summary} />
      <div className="wizard__field">
        <Field label="Código de instalación" help="El código impreso que se entregó aparte" exacting {...state}>
          <TextField {...control} uppercase autoComplete="off" spellCheck={false} className="wizard__code" />
        </Field>
      </div>
      <Notice tone="info">
        Tiene la forma XXXX-XXXX-XXXX y está en la hoja impresa que se entregó con el paquete. No hace falta escribir
        los guiones.
      </Notice>
      <div className="srv-foot">
        <Button variant="ghost" onClick={() => m.back('comprobacion')}>
          Atrás
        </Button>
        <Button type="submit" busy={m.checkingCode} busyLabel="Comprobando…">
          Continuar
        </Button>
      </div>
    </form>
  );
}

function RouterIllustration() {
  return (
    <svg
      className="srv-opt__ill"
      viewBox="0 0 320 96"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="134" y="34" width="52" height="26" rx="5" />
      <path d="M146 34v-12M174 34v-12" />
      <rect x="18" y="58" width="58" height="34" rx="3" />
      <path d="M10 92h74" />
      <rect x="252" y="40" width="24" height="44" rx="4" />
      <rect x="286" y="48" width="22" height="36" rx="4" />
      <path d="M76 70l58-18M186 50l66 6M186 54l100 8" strokeDasharray="4 4" />
    </svg>
  );
}

function HotspotIllustration() {
  return (
    <svg
      className="srv-opt__ill"
      viewBox="0 0 320 96"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="148" y="24" width="24" height="44" rx="4" />
      <path d="M154 18c4-4 8-4 12 0M150 12c7-7 13-7 20 0" />
      <rect x="18" y="58" width="58" height="34" rx="3" />
      <path d="M10 92h74" />
      <rect x="252" y="40" width="24" height="44" rx="4" />
      <rect x="286" y="48" width="22" height="36" rx="4" />
      <path d="M76 70l72-22M172 46l80 10M172 50l114 10" strokeDasharray="4 4" />
    </svg>
  );
}

const NETWORKS = [
  {
    id: 'router',
    title: 'Router wifi',
    Ill: RouterIllustration,
    text: 'La PC servidor y todos los dispositivos se conectan al mismo router wifi. La PC servidor puede ir por cable.',
    needs: ['Un router wifi en el almacén', 'Sin límite práctico de dispositivos'],
  },
  {
    id: 'hotspot',
    title: 'Hotspot de un celular',
    Ill: HotspotIllustration,
    text: 'Un celular comparte su wifi con la PC servidor y los dispositivos.',
    needs: [
      'Un celular dedicado, junto a la PC, enchufado y sin datos móviles',
      'Una PC de escritorio sin wifi necesita un adaptador wifi USB',
      'Hasta 8 dispositivos conectados; para más, un router',
    ],
  },
] as const;

/** T130 · RF-INS-07: el archivo de traslado (.icmove) y la contraseña de respaldo con que se cifró. */
function MoveFile({ m }: { m: CreateServerModel }) {
  const { control, state } = m.movePassword;
  const name = m.moveFile?.split(/[\\/]/).pop();
  return (
    <form className="wizard__form" noValidate onSubmit={(e) => void m.submitMove(e)}>
      <div>
        <h2 className="wizard__title">Archivo de traslado</h2>
        <p className="wizard__lead">
          El que creó «Preparar traslado» en la PC anterior. La base, la identidad y el montaje de red vienen en él.
        </p>
      </div>
      {m.notice && <Notice tone="bad">{m.notice}</Notice>}
      <ErrorSummary errors={m.moveSummary} />
      <div className="up-file">
        <div>
          <b>{name ?? 'Ningún archivo elegido'}</b>
          {m.moveFile && <span>{m.moveFile}</span>}
        </div>
        <Button variant="ghost" onClick={() => void m.pickMoveFile()}>
          {m.moveFile ? 'Cambiar' : 'Elegir el archivo'}
        </Button>
      </div>
      <div className="wizard__field">
        <Field
          label="Contraseña de respaldo"
          help="La misma con la que se cifran los respaldos de la empresa."
          {...state}
        >
          <PasswordField {...control} autoComplete="off" />
        </Field>
      </div>
      {m.moveInfo && (
        <div className="server-id">
          <ShieldCheck aria-hidden="true" />
          <div>
            <b>Servidor {m.moveInfo.serverName}</b>
            <span>
              {`Misma identidad: los ${m.moveInfo.devices} dispositivos emparejados se reconectarán solos. El montaje de red se conserva.`}
            </span>
          </div>
        </div>
      )}
      <div className="srv-foot">
        <Button variant="ghost" onClick={() => m.back('permisos')}>
          Atrás
        </Button>
        <Button type="submit" busy={m.checkingMove} busyLabel="Comprobando el archivo…">
          Trasladar a esta PC
        </Button>
      </div>
    </form>
  );
}

function Network({ m }: { m: CreateServerModel }) {
  return (
    <>
      <h2 className="wizard__title">¿Cómo se conectan los dispositivos a esta PC?</h2>
      {m.notice && <Notice tone="bad">{m.notice}</Notice>}
      <div className="srv-opts" role="radiogroup" aria-label="Montaje de red">
        {NETWORKS.map(({ id, title, Ill, text, needs }) => {
          const checked = m.network === id;
          return (
            <div
              key={id}
              className="srv-opt"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => m.setNetwork(id)}
              onKeyDown={(e) => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                  e.preventDefault();
                  const next = m.network === 'router' ? 'hotspot' : 'router';
                  m.setNetwork(next);
                  (
                    e.currentTarget.parentElement?.querySelector(`[data-network="${next}"]`) as HTMLElement | null
                  )?.focus();
                } else if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  m.setNetwork(id);
                }
              }}
              data-network={id}
            >
              <h3>
                <Wifi aria-hidden="true" />
                {title}
                {id === 'router' && <span className="srv-opt__pill">Recomendado</span>}
              </h3>
              <Ill />
              <span>{text}</span>
              <ul>
                {needs.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {m.network === 'hotspot' && !m.wifiPc && (
        <Notice tone="warn">Esta PC no está conectada por wifi: necesitará un adaptador wifi USB.</Notice>
      )}
      <div className="srv-foot">
        <Button variant="ghost" onClick={() => m.back('permisos')}>
          Atrás
        </Button>
        <Button icon={<ShieldCheck aria-hidden="true" />} onClick={m.create}>
          Crear el servidor
        </Button>
      </div>
    </>
  );
}

function Creating({ m }: { m: CreateServerModel }) {
  const { progress } = m;
  const done = progress.steps.filter((s) => s.state === 'done').length;
  const percent = progress.steps.length ? Math.round((done / progress.steps.length) * 100) : 0;
  const now = m.elapsedMs; // fuerza el repintado cada segundo
  const at = Date.now();

  if (m.undone)
    return (
      <>
        <h2 className="wizard__title">La PC quedó como estaba</h2>
        <p className="wizard__lead">Se quitó todo lo que se había hecho. Puede volver a intentarlo cuando quiera.</p>
        <StepList progress={progress} now={at} />
        <div className="srv-foot">
          <Button onClick={m.cancel}>Volver</Button>
        </div>
      </>
    );

  if (m.running === 'deshacer')
    return (
      <>
        <h2 className="wizard__title">Deshaciendo…</h2>
        <p className="wizard__lead">
          Solo se borra lo creado ahora. Cuando termine, la PC queda como antes de empezar.
        </p>
        <StepList progress={progress} now={at} />
        <TechnicalLog progress={progress} />
      </>
    );

  if (m.failed && !m.running)
    return (
      <>
        <h2 className="wizard__title">No se pudo terminar</h2>
        <Notice tone="bad">
          <b>{m.failedTitle ? `No se pudo: ${m.failedTitle.toLowerCase()}.` : 'No se pudo crear el servidor.'}</b>
          <br />
          {m.failedHelp}
        </Notice>
        {m.notice && <Notice tone="bad">{m.notice}</Notice>}
        <StepList progress={progress} now={at} />
        <TechnicalLog progress={progress} />
        <div className="srv-foot">
          <span className="srv-foot__left">Deshacer quita lo hecho y deja la PC como estaba.</span>
          <Button variant="ghost" onClick={m.undo}>
            Deshacer
          </Button>
          <Button onClick={m.retry}>Reintentar</Button>
        </div>
      </>
    );

  return (
    <>
      <div>
        <h2 className="wizard__title">
          {m.moving ? `Trasladando el servidor${m.moveInfo ? ` ${m.moveInfo.serverName}` : ''}` : 'Creando el servidor'}
        </h2>
        <p className="wizard__lead">Suele tardar menos de 20 minutos. Puede seguir usando la PC.</p>
      </div>
      <div className="srv-progress">
        <div className="srv-progress__row">
          <span>
            {progress.steps.length
              ? `Paso ${Math.min(done + 1, progress.steps.length)} de ${progress.steps.length}`
              : 'Esperando el permiso de Windows…'}
          </span>
          <span className="num">{minutes(now)}</span>
        </div>
        <ProgressBar label="Creando el servidor" value={percent} />
      </div>
      <StepList progress={progress} now={at} />
      <TechnicalLog progress={progress} />
    </>
  );
}

const GUIDE = {
  router: [
    'Conecte cada teléfono, tablet o PC al wifi del almacén.',
    'Instale Órdenes de Carga y ábrala: encontrará este servidor sola.',
    'Empareje cada uno con el código o con este QR; los códigos se confirman en Estado del servidor.',
    'Deje esta PC encendida y con la app abierta: así avisa antes de apagarla.',
  ],
  hotspot: [
    'Deje el celular del hotspot junto a esta PC, enchufado y sin datos móviles.',
    'Conecte cada teléfono, tablet o PC al wifi de ese celular.',
    'Instale Órdenes de Carga y ábrala: encontrará este servidor sola.',
    'Empareje cada uno con el código o con este QR; los códigos se confirman en Estado del servidor.',
    'Deje esta PC encendida y con la app abierta: así avisa antes de apagarla.',
  ],
};

function Ready({ m }: { m: CreateServerModel }) {
  if (!m.ready) return <Skeleton lines={6} />;
  const { name, address, port, qr } = m.ready;
  return (
    <>
      <div className="srv-done">
        <div className="srv-done__main">
          <div>
            <h2 className="wizard__title">El servidor está listo</h2>
            <p className="wizard__lead">
              {m.elapsedMs > 0 ? `Creado en ${minutes(m.elapsedMs)}. ` : ''}Arranca solo cada vez que se enciende esta
              PC.
            </p>
          </div>
          <div className="server-id">
            <ShieldCheck aria-hidden="true" />
            <div>
              <b>{name}</b>
              <span>
                {[address, `puerto ${port}`, m.network === 'hotspot' ? 'hotspot de un celular' : 'router wifi']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          </div>
          <div>
            <b>Para conectar los dispositivos ({m.network === 'hotspot' ? 'hotspot' : 'router wifi'})</b>
            <ol className="steps-ol">
              {GUIDE[m.network].map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ol>
          </div>
        </div>
        {qr && (
          <figure className="srv-qr">
            <QrCode value={qr} label={`QR para emparejar con ${name}`} />
            <figcaption>{name}</figcaption>
          </figure>
        )}
      </div>
      <div className="srv-foot">
        <Button onClick={m.firstApoderada}>Crear la primera Apoderada</Button>
      </div>
    </>
  );
}

export function CreateServerDesktop({ m }: { m: CreateServerModel }) {
  return (
    <main className="wizard">
      <Steps m={m} />
      <section className="wizard__main" aria-live="polite">
        {m.step === 'comprobacion' && <Checking m={m} />}
        {m.step === 'permisos' && <Permissions m={m} />}
        {m.step === 'montaje' && <Network m={m} />}
        {m.step === 'archivo' && <MoveFile m={m} />}
        {m.step === 'creacion' && <Creating m={m} />}
        {m.step === 'listo' && <Ready m={m} />}
      </section>
    </main>
  );
}
