// T112 · P-24 Respaldos y restauración (maqueta T111): el estado arriba, las órdenes perdidas mientras queden, la lista
// de respaldos con «Restaurar» (tabla en TAB y ESC, tarjetas en TEL), la contraseña de respaldo (F-16), la restauración
// por pasos y la confirmación de la numeración.
import { CONFIRM_EVERY_DAYS, havanaDate, havanaDateTime } from '@impocaribe/shared';
import { RESTORE_WORD, type BackupDto, type LostOrderDto } from '@impocaribe/shared/validation';
import { CloudOff } from 'lucide-react';
import { Button, PasswordField, TextField } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { ErrorSummary, Field } from '../../ui/form';
import { Dialog, ReasonDialog } from '../../ui/overlays';
import { Badge, EmptyState, ErrorState, Notice, Skeleton, StatCard } from '../../ui/presentation';
import { Stepper } from '../../ui/structure';
import { blocked } from '../catalogs/CatalogLayout';
import type { BackupsModel } from './useBackups';

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-CU', { timeZone: 'America/Havana', hourCycle: 'h23', ...opts });
const HOUR = fmt({ hour: '2-digit', minute: '2-digit' });
const LONG = fmt({ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const DAY = fmt({ day: '2-digit', month: '2-digit', year: 'numeric' });
const clean = (s: string) => s.replace(',', '');
/** «02/10 09:05»: el día y el mes con dos cifras (es-CU no las rellena sin el año). */
const dropYear = (s: string) => `${s.slice(0, 5)}${s.slice(10)}`;
const short = (iso: string) => dropYear(havanaDateTime(new Date(iso)));
const long = (iso: string) => clean(LONG.format(new Date(iso)));
const day = (d: Date) => DAY.format(d);

/** «Hoy 14:00», «Ayer 20:00» o «22/10 20:00». */
function relative(iso: string, now: Date) {
  const at = new Date(iso);
  const d = havanaDate(at);
  if (d === havanaDate(now)) return `Hoy ${HOUR.format(at)}`;
  if (d === havanaDate(new Date(now.getTime() - 86_400_000))) return `Ayer ${HOUR.format(at)}`;
  return short(iso);
}

export const KIND: Record<BackupDto['kind'], string> = {
  hourly: 'Por hora',
  daily: 'Diario',
  manual: 'Manual',
  pre_restore: 'Antes de restaurar',
};
const size = (b: number | null) => (b === null ? '—' : `${(b / 1_048_576).toFixed(1).replace('.', ',')} MB`);

function State({ b }: { b: BackupDto }) {
  if (b.status === 'failed') return <Badge tone="bad">Falló</Badge>;
  if (b.status === 'running') return <Badge tone="info">En curso</Badge>;
  if (!b.available) return <Badge>{b.kind === 'hourly' ? 'Borrado (48 h)' : 'Borrado'}</Badge>;
  return <Badge tone="ok">Bien</Badge>;
}

/** Lo que va en la última columna: «Restaurar», el error del que falló o nada. */
function RowAction({ m, b }: { m: BackupsModel; b: BackupDto }) {
  if (b.status === 'failed') return <span className="catalog-text">{b.error ?? 'Sin detalle'}</span>;
  if (b.status !== 'ok' || !b.available) return null;
  return (
    <Button
      variant="ghost"
      aria-label={`Restaurar el respaldo del ${long(b.startedAt)}`}
      onClick={() => m.startRestore(b)}
      {...blocked(m.offlineReason ?? (m.status?.defined ? undefined : 'Primero defina la contraseña de respaldo.'))}
    >
      Restaurar
    </Button>
  );
}

function Status({ m }: { m: BackupsModel }) {
  const now = m.now();
  const s = m.status;
  const since = s?.confirmedAt ?? s?.setAt;
  const next = since && new Date(new Date(since).getTime() + CONFIRM_EVERY_DAYS * 86_400_000);
  return (
    <div className="backups-status">
      <StatCard
        label="Por hora (en la jornada)"
        value={m.lastHourly ? `${relative(m.lastHourly.startedAt, now)} ✓` : 'Ninguno todavía'}
        note="Se conservan 48 horas"
      />
      <StatCard
        label="Diario"
        value={m.lastDaily ? `${relative(m.lastDaily.startedAt, now)} ✓` : 'Ninguno todavía'}
        note={
          m.lastDaily?.externalPath
            ? `Copiado a ${m.lastDaily.externalPath} · se conservan 30`
            : 'Sin copia externa · se conservan 30'
        }
      />
      <StatCard
        label="Contraseña de respaldo"
        value={
          !s?.defined ? 'Sin definir' : s.confirmedAt ? `Confirmada el ${day(new Date(s.confirmedAt))}` : 'Definida'
        }
        note={
          s?.defined && (
            <>
              {next && `Próxima confirmación: ${day(next)} · `}
              <button type="button" className="backups-link" onClick={m.openPassword}>
                Cambiar
              </button>
            </>
          )
        }
      />
    </div>
  );
}

/** Sin contraseña no se hace ningún respaldo (AL-12): es lo primero que se pide. */
function PasswordForm({ m, change }: { m: BackupsModel; change: boolean }) {
  const f = m.passwordFields;
  return (
    <form className="backups-form" noValidate onSubmit={m.submitPassword}>
      <ErrorSummary errors={m.passwordSummary} />
      {m.passwordError && <Notice tone="bad">{m.passwordError}</Notice>}
      {change && (
        <Field label="Contraseña actual" {...f.current.state}>
          <PasswordField autoComplete="current-password" {...f.current.control} />
        </Field>
      )}
      <Field label="Contraseña de respaldo" help="Al menos 12 caracteres" {...f.password.state}>
        <PasswordField autoComplete="new-password" {...f.password.control} />
      </Field>
      <Field label="Confírmela" {...f.confirm.state}>
        <PasswordField autoComplete="new-password" {...f.confirm.control} />
      </Field>
      {!change && (
        <div className="catalog-actions">
          <Button type="submit" busy={m.passwordSaving} busyLabel="Guardando…" {...blocked(m.offlineReason)}>
            Guardar la contraseña
          </Button>
        </div>
      )}
    </form>
  );
}

function NoPassword({ m }: { m: BackupsModel }) {
  return (
    <section className="backups-card" data-tone="bad" aria-labelledby="respaldo-definir">
      <h2 id="respaldo-definir">Defina la contraseña de respaldo</h2>
      <p className="catalog-text">Sin ella no se hace ningún respaldo automático.</p>
      <PasswordForm m={m} change={false} />
    </section>
  );
}

function Numbering({ m }: { m: BackupsModel }) {
  return (
    <section className="backups-card" data-tone="warn" aria-labelledby="respaldo-numeracion">
      <h2 id="respaldo-numeracion">Confirme la numeración</h2>
      <p className="catalog-text">
        La restauración no pudo guardar el estado anterior. Escriba el último número impreso de cada buque abierto:
        hasta entonces no se emiten órdenes.
      </p>
      <div className="backups-numbering">
        {m.numbering!.map((v) => (
          <Field
            key={v.id}
            id={`numeracion-${v.id}`}
            label={`Último impreso de ${v.name}`}
            help={`Restaurado: ${String(v.lastOrderSeq).padStart(4, '0')}`}
            error={m.numberingErrors[v.id]}
          >
            <TextField
              id={`numeracion-${v.id}`}
              digitsOnly
              value={m.printed[v.id] ?? ''}
              onValueChange={(value) => m.setPrinted(v.id, value)}
              invalid={!!m.numberingErrors[v.id]}
              aria-describedby={`numeracion-${v.id}-msg`}
            />
          </Field>
        ))}
      </div>
      <div className="catalog-actions">
        <Button
          onClick={m.confirmNumbering}
          busy={m.busy === 'numeracion'}
          busyLabel="Confirmando…"
          {...blocked(m.offlineReason)}
        >
          Confirmar la numeración
        </Button>
      </div>
    </section>
  );
}

function LostRow({ m, l }: { m: BackupsModel; l: LostOrderDto }) {
  return (
    <div className="backups-lost__row" role="listitem" aria-label={`Orden perdida ${l.number}`}>
      <div>
        <b className="backups-num">{l.number}</b>
        {` · DM ${l.declarationNumber} · ${l.truckPlate} · ${l.tons.replace('.', ',')} t`}
        <br />
        {l.lastError ? (
          <span className="backups-error">{l.lastError}</span>
        ) : (
          <span className="catalog-text">{`Emitida el ${short(l.issuedAt)} por ${l.issuedByName ?? '—'}`}</span>
        )}
      </div>
      <div className="catalog-actions">
        <Button
          onClick={() => m.recover(l)}
          busy={m.busy === `recuperar-${l.id}`}
          busyLabel="Recuperando…"
          {...blocked(m.offlineReason)}
        >
          Recuperar
        </Button>
        <Button variant="ghost" onClick={() => m.askDiscard(l)} {...blocked(m.offlineReason)}>
          Descartar
        </Button>
      </div>
    </div>
  );
}

function Lost({ m }: { m: BackupsModel }) {
  const n = m.lostPending.length;
  return (
    <section className="backups-card backups-lost" data-tone="bad" aria-labelledby="respaldo-perdidas">
      <h2 id="respaldo-perdidas">{`Órdenes perdidas en la restauración · ${n === 1 ? '1 pendiente' : `${n} pendientes`}`}</h2>
      <p className="catalog-text">
        Se emitieron después del respaldo restaurado. Recupérelas con su número original o descártelas con motivo.
      </p>
      <div role="list" className="backups-lost__list">
        {m.lostPending.map((l) => (
          <LostRow key={l.id} m={m} l={l} />
        ))}
      </div>
    </section>
  );
}

function Table({ m }: { m: BackupsModel }) {
  return (
    <div className="ui-table-scroll">
      <table className="ui-table backups-table">
        <caption className="ui-visually-hidden">Respaldos</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Tipo</th>
            <th scope="col" className="backups-r">
              Tamaño
            </th>
            <th scope="col">Estado</th>
            <th scope="col">Copia externa</th>
            <th scope="col">
              <span className="ui-visually-hidden">Acción</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {m.backups.map((b) => (
            <tr key={b.id} aria-label={`${KIND[b.kind]} ${short(b.startedAt)}`}>
              <td className="backups-num">{short(b.startedAt)}</td>
              <td>{KIND[b.kind]}</td>
              <td className="backups-num backups-r">{size(b.sizeBytes)}</td>
              <td>
                <State b={b} />
              </td>
              <td>{b.externalCopiedAt ? (b.externalPath ?? '—') : '—'}</td>
              <td>
                <RowAction m={m} b={b} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cards({ m }: { m: BackupsModel }) {
  return (
    <div className="catalog-cards" role="list" aria-label="Respaldos">
      {m.backups.map((b) => (
        <div key={b.id} role="listitem" className="backups-item" aria-label={`${KIND[b.kind]} ${short(b.startedAt)}`}>
          <div className="backups-item__head">
            <b>{KIND[b.kind]}</b>
            <State b={b} />
          </div>
          <span className="catalog-text">
            {[short(b.startedAt), size(b.sizeBytes), b.externalCopiedAt && `copiado a ${b.externalPath}`]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <RowAction m={m} b={b} />
        </div>
      ))}
    </div>
  );
}

const STEPS = ['Respaldo', 'Contraseña', 'Confirmar', 'Resultado'];
const STEP_INDEX = { password: 1, confirm: 2, running: 3, done: 3 } as const;

/** RF-RES-03: contraseña → escribir «RESTAURAR» con lo que pasará → progreso → resultado. */
function Restore({ m }: { m: BackupsModel }) {
  const f = m.flow!;
  const at = long(f.backup.startedAt);
  const title = `Restaurar el respaldo del ${at} (${KIND[f.backup.kind].toLowerCase()})`;
  const running = f.step === 'running';
  const footer =
    f.step === 'password' ? (
      <>
        <Button variant="ghost" onClick={m.cancelRestore}>
          Cancelar
        </Button>
        <Button onClick={m.toConfirm}>Seguir</Button>
      </>
    ) : f.step === 'confirm' || running ? (
      <>
        <Button variant="ghost" onClick={m.back} disabled={running}>
          Atrás
        </Button>
        <Button
          variant="danger"
          onClick={() => void m.restore()}
          busy={running}
          busyLabel="Restaurando…"
          {...blocked(m.offlineReason ?? (m.canRestore ? undefined : `Escriba ${RESTORE_WORD} para confirmar.`))}
        >
          Restaurar
        </Button>
      </>
    ) : (
      <Button onClick={m.signOut}>Volver a entrar</Button>
    );
  return (
    <Dialog title={title} onClose={running || f.step === 'done' ? () => undefined : m.cancelRestore} footer={footer}>
      <Stepper steps={STEPS} current={STEP_INDEX[f.step]} />
      {f.step === 'password' && (
        <Field id="restaurar-contrasena" label="Contraseña de respaldo" error={f.error ?? undefined}>
          <PasswordField
            id="restaurar-contrasena"
            autoComplete="off"
            value={f.password}
            onValueChange={m.setFlowPassword}
            invalid={!!f.error}
            aria-describedby="restaurar-contrasena-msg"
          />
        </Field>
      )}
      {(f.step === 'confirm' || running) && (
        <>
          <div className="backups-consequence">
            <b>Lo que pasará</b>
            <ul>
              <li>{`Todo vuelve a como estaba el ${at}.`}</li>
              <li>
                Lo hecho después se guarda antes en un respaldo; las órdenes emitidas después quedarán como perdidas.
              </li>
              <li>Se cierran todas las sesiones, también la suya.</li>
            </ul>
          </div>
          {f.error && <Notice tone="bad">{f.error}</Notice>}
          <Field id="restaurar-palabra" label={`Escriba ${RESTORE_WORD} para confirmar`}>
            <TextField
              id="restaurar-palabra"
              autoComplete="off"
              value={f.word}
              onValueChange={m.setFlowWord}
              disabled={running}
              aria-describedby="restaurar-palabra-msg"
            />
          </Field>
          {running && (
            <p className="catalog-text">Respaldando el estado actual y restaurando… no cierre esta ventana.</p>
          )}
        </>
      )}
      {f.step === 'done' && f.result && (
        <div className="backups-done" role="status">
          <ul className="backups-progress">
            <li>Respaldo del estado actual</li>
            <li>Base y archivos restaurados</li>
            <li>Numeración ajustada: ningún número se repite</li>
            <li>Sesiones cerradas</li>
          </ul>
          <p>
            {f.result.lostOrders === 0 ? (
              'No se perdió ninguna orden.'
            ) : (
              <>
                <b>{f.result.lostOrders === 1 ? '1 orden perdida' : `${f.result.lostOrders} órdenes perdidas`}</b> para
                recuperar o descartar. Vuelva a entrar para verlas.
              </>
            )}
          </p>
          {f.result.confirmationRequired && (
            <Notice tone="warn">
              No se pudo guardar el estado anterior: antes de emitir órdenes hay que confirmar la numeración.
            </Notice>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Dialogs({ m }: { m: BackupsModel }) {
  return (
    <>
      {m.flow && <Restore m={m} />}
      {m.passwordOpen && (
        <Dialog
          title="Cambiar la contraseña de respaldo"
          description="Los respaldos anteriores se podrán restaurar con la nueva."
          onClose={m.closePassword}
          footer={
            <>
              <Button variant="ghost" onClick={m.closePassword}>
                Cancelar
              </Button>
              <Button
                onClick={(e) => void m.submitPassword(e)}
                busy={m.passwordSaving}
                busyLabel="Guardando…"
                {...blocked(m.offlineReason)}
              >
                Guardar la contraseña
              </Button>
            </>
          }
        >
          <PasswordForm m={m} change />
        </Dialog>
      )}
      {m.discarding && (
        <ReasonDialog
          title={`Descartar la orden ${m.discarding.number}`}
          description="Queda como perdida y descartada; su número no se vuelve a usar."
          confirmLabel="Descartar"
          onConfirm={m.discard}
          onClose={m.cancelDiscard}
        />
      )}
    </>
  );
}

export function BackupsView({ model: m, device }: { model: BackupsModel; device: DeviceClass }) {
  if (!m.connected)
    return (
      <EmptyState
        icon={<CloudOff aria-hidden="true" />}
        title="Los respaldos se consultan en el servidor."
        description="Sin conexión no se pueden ver. Vuelva a intentarlo cuando el dispositivo se conecte."
      />
    );
  if (m.loading) return <Skeleton lines={8} />;
  if (m.failed) return <ErrorState message="No se pudo leer el estado de los respaldos." onRetry={m.retry} />;
  const defined = m.status?.defined ?? false;
  return (
    <div className="backups-page">
      <div className="backups-top">
        {m.notice ? <Notice tone={m.notice.tone}>{m.notice.text}</Notice> : <span />}
        <Button
          onClick={m.manual}
          busy={m.busy === 'manual'}
          busyLabel="Respaldando…"
          {...blocked(m.offlineReason ?? (defined ? undefined : 'Primero defina la contraseña de respaldo.'))}
        >
          Hacer un respaldo ahora
        </Button>
      </div>
      {!defined && <NoPassword m={m} />}
      {m.numbering && <Numbering m={m} />}
      {m.lostPending.length > 0 && <Lost m={m} />}
      {defined && <Status m={m} />}
      {m.backups.length === 0 ? (
        <EmptyState title="Todavía no hay respaldos." />
      ) : device === 'phone' ? (
        <Cards m={m} />
      ) : (
        <Table m={m} />
      )}
      <Dialogs m={m} />
    </div>
  );
}
