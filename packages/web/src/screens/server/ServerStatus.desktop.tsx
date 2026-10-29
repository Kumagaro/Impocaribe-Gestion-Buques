// T128 · P-29 Estado del servidor en escritorio (ui-spec P-29 y maqueta T124). Solo existe en la PC servidor
// (Const. art. XIV.1, excepción de P-28, P-29 y P-31).
import { ShieldCheck } from 'lucide-react';
import { Button, PasswordField, TextField } from '../../ui/controls';
import { ErrorSummary, Field } from '../../ui/form';
import { Dialog } from '../../ui/overlays';
import { Badge, Notice, ProgressBar, Skeleton } from '../../ui/presentation';
import { QrCode } from '../../ui/qr';
import { selectOf } from '../catalogs/Fleet.parts';
import { clock, StepList, TechnicalLog } from './SetupParts';
import { MAINTENANCE_TITLE, type Maintenance, type ServerStatusModel } from './useServerStatus';

const MB = 2 ** 20;
/** «452 MB», «1,2 GB»: con coma decimal, como el resto de la app (no depende del idioma del sistema). */
const bytes = (n: number) =>
  n >= 1024 * MB ? `${(n / (1024 * MB)).toFixed(1).replace('.', ',')} GB` : `${Math.round(n / MB)} MB`;

/** «3 d 4 h», «2 h 15 min», «6 min». */
export function uptime(fromIso: string, now: number): string {
  const m = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m % 60} min`;
  return `${m} min`;
}

const PLATFORM = { windows: 'Windows', android: 'Android' } as const;
const date = (iso: string) => new Date(iso).toLocaleDateString('es-CU', { timeZone: 'America/Havana' });

function Tile({
  label,
  value,
  tone = 'ok',
  children,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'bad';
  children?: React.ReactNode;
}) {
  return (
    <section className="srv-tile" data-tone={tone} aria-label={label}>
      <span className="srv-tile__label">{label}</span>
      <span className="srv-tile__value">
        <i className="srv-tile__dot" aria-hidden="true" />
        {value}
      </span>
      {children}
    </section>
  );
}

function Tiles({ m }: { m: ServerStatusModel }) {
  const s = m.status!;
  const p = s.power;
  const used = s.memory.serviceBytes + (s.memory.databaseBytes ?? 0) + (s.memory.pdfBytes ?? 0);
  const pct = Math.round((used / s.memory.budgetBytes) * 100);
  const setup = s.network.setup === 'hotspot' ? 'Hotspot de un celular' : 'Router wifi';
  return (
    <div className="srv-grid">
      <Tile label="Servicio" value={m.error ? 'No responde' : 'En marcha'} tone={m.error ? 'bad' : 'ok'}>
        <span className="num">
          Versión {s.version} · encendido hace {uptime(s.startedAt, m.now)}
        </span>
      </Tile>
      <Tile
        label="Energía"
        value={
          p.protected
            ? `Modo protegido${p.percent !== null ? ` · ${p.percent} %` : ''}`
            : p.onBattery
              ? `Con batería${p.percent !== null ? ` · ${p.percent} %` : ''}`
              : 'Con corriente'
        }
        tone={p.protected ? 'bad' : p.onBattery ? 'warn' : 'ok'}
      >
        <span>
          {p.protected
            ? 'No acepta cambios; los datos están asegurados en disco. Al 5 % se detiene ordenadamente.'
            : p.onBattery
              ? 'Con el 15 % pasa a modo protegido.'
              : p.percent !== null
                ? `Batería al ${p.percent} %`
                : 'Sin batería ni UPS'}
        </span>
      </Tile>
      <Tile label="Red" value={setup} tone={m.hotspotFull ? 'warn' : 'ok'}>
        <span className="num">
          {[s.network.address ?? 'sin red', `puerto ${s.network.port}`, `${m.connected} conectados`].join(' · ')}
        </span>
      </Tile>
      <Tile label="Memoria" value={`${bytes(used)} de ${bytes(s.memory.budgetBytes)}`} tone={pct > 100 ? 'warn' : 'ok'}>
        <ProgressBar label="Memoria del servidor" value={Math.min(100, pct)} tone={pct > 100 ? 'warn' : 'info'} />
        <span>
          {[
            `Base de datos ${s.memory.databaseBytes !== null ? bytes(s.memory.databaseBytes) : 'sin medir'}`,
            `servicio ${bytes(s.memory.serviceBytes)}`,
            s.memory.pdfBytes !== null ? `PDF ${bytes(s.memory.pdfBytes)}` : 'PDF cerrado',
          ].join(' · ')}
        </span>
      </Tile>
    </div>
  );
}

function Requests({ m }: { m: ServerStatusModel }) {
  return (
    <section className="srv-panel" aria-labelledby="srv-req">
      <div className="srv-panel__head">
        <h2 id="srv-req">Solicitudes de emparejamiento</h2>
        {m.pending.length > 0 && (
          <Badge tone="info">{`${m.pending.length} pendiente${m.pending.length > 1 ? 's' : ''}`}</Badge>
        )}
      </div>
      {m.pending.length === 0 ? (
        <p className="srv-panel__empty">No hay solicitudes. Al emparejar un dispositivo, su código aparece aquí.</p>
      ) : (
        <>
          <ul className="srv-reqs">
            {m.pending.map((r) => (
              <li key={r.id} className="srv-req">
                <span className="srv-req__code" aria-label={`Código ${r.code.split('').join(' ')}`}>
                  {r.code.slice(0, 3)} {r.code.slice(3)}
                </span>
                <span className="srv-req__who">
                  <b>{r.deviceName}</b>
                  {PLATFORM[r.platform]} · caduca en {clock(Date.parse(r.expiresAt) - m.now)}
                </span>
                <span className="srv-req__actions">
                  <Button variant="ghost" busy={m.busy === `rechazar-${r.id}`} onClick={() => m.reject(r)}>
                    Rechazar
                  </Button>
                  <Button busy={m.busy === `confirmar-${r.id}`} onClick={() => m.confirm(r)}>
                    Confirmar
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <p className="srv-panel__note">
            Confirme solo si el dispositivo muestra el mismo código. Si no coincide, rechácelo.
          </p>
        </>
      )}
    </section>
  );
}

function Devices({ m }: { m: ServerStatusModel }) {
  const s = m.status!;
  return (
    <section className="srv-panel" aria-labelledby="srv-dev">
      <div className="srv-panel__head">
        <h2 id="srv-dev">Dispositivos</h2>
        <span className="srv-panel__count">{`${m.connected} conectados ahora · ${s.devices.length} emparejados`}</span>
      </div>
      {m.hotspotFull && (
        <Notice tone="warn">
          {`${m.connected} dispositivos conectados al hotspot. Es el límite recomendado para un celular: con más, la conexión se vuelve lenta e inestable. Para más dispositivos hace falta un router wifi.`}
        </Notice>
      )}
      <div className="srv-table-wrap">
        <table className="srv-table">
          <thead>
            <tr>
              <th scope="col">Dispositivo</th>
              <th scope="col">Plataforma</th>
              <th scope="col">Estado</th>
              <th scope="col">Emparejado</th>
              {m.canRevoke && (
                <th scope="col">
                  <span className="ui-visually-hidden">Acciones</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {s.devices.map((d) => (
              <tr key={d.id}>
                <td>{d.pairedMethod === 'local' ? `${d.name} (esta PC)` : d.name}</td>
                <td>{PLATFORM[d.platform]}</td>
                <td>
                  <Badge tone={d.connected ? 'ok' : 'mute'}>
                    {d.connected ? 'Conectado' : d.lastSeenAt ? `Visto el ${date(d.lastSeenAt)}` : 'Sin conectar'}
                  </Badge>
                </td>
                <td className="num">{date(d.pairedAt)}</td>
                {m.canRevoke && (
                  <td>
                    {d.pairedMethod !== 'local' && (
                      <Button
                        variant="ghost"
                        busy={m.busy === `revocar-${d.id}`}
                        onClick={() => m.revoke(d.id, d.name)}
                      >
                        Revocar
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MaintenanceActions({ m }: { m: ServerStatusModel }) {
  return (
    <section className="srv-panel" aria-labelledby="srv-mnt">
      <div className="srv-panel__head">
        <h2 id="srv-mnt">Mantenimiento</h2>
      </div>
      {m.canMaintain ? (
        <div className="srv-actions">
          {(['reparar', 'reiniciar', 'actualizar', 'restablecer'] as Maintenance[]).map((w) => (
            <Button
              key={w}
              variant="secondary"
              onClick={() => m.open(w)}
              {...(w === 'actualizar' && !m.updateTo
                ? { disabledReason: 'Para actualizar, instale en esta PC el instalador completo de la versión nueva.' }
                : {})}
            >
              {w === 'actualizar' && m.updateTo ? `Actualizar el servidor a la ${m.updateTo}` : MAINTENANCE_TITLE[w]}
            </Button>
          ))}
          <span className="srv-actions__note">
            <ShieldCheck aria-hidden="true" />
            Piden permiso de administrador de Windows y el código de instalación.
          </span>
        </div>
      ) : (
        <p className="srv-panel__empty">El mantenimiento se hace desde la app que puso el instalador completo.</p>
      )}
    </section>
  );
}

function MaintenanceDialog({ m }: { m: ServerStatusModel }) {
  if (!m.maintenance) return null;
  const which = m.maintenance;
  const started = m.running || m.outcome !== null;
  const footer = m.outcome ? (
    <Button onClick={m.close}>Cerrar</Button>
  ) : started ? null : (
    <>
      <Button variant="ghost" onClick={m.close}>
        Cancelar
      </Button>
      <Button type="submit" form="srv-mnt-form">
        {which === 'restablecer' ? 'Restablecer' : MAINTENANCE_TITLE[which]}
      </Button>
    </>
  );
  const done = m.outcome?.ok;
  return (
    <Dialog title={MAINTENANCE_TITLE[which]} onClose={m.close} footer={footer}>
      {!started && which !== 'restablecer' && (
        <form id="srv-mnt-form" className="srv-mnt-form" noValidate onSubmit={(e) => void m.submitCode(e)}>
          <p>
            {which === 'reparar'
              ? 'Rehace los servicios, el firewall y la energía sin tocar los datos ni la identidad del servidor.'
              : which === 'actualizar'
                ? `Pasa el servidor de la ${m.status?.version ?? ''} a la ${m.updateTo ?? ''}: guarda antes una copia de la versión actual y de sus datos, y publica la app ligera y el APK nuevos. Si algo falla, vuelve sola a la versión actual con sus datos. Los dispositivos esperan unos minutos sin servidor.`
                : 'Detiene el servidor y lo vuelve a arrancar. Los dispositivos se reconectan solos.'}
          </p>
          <ErrorSummary errors={m.codeSummary} />
          <Field
            label="Código de instalación"
            help="El código impreso que se entregó aparte"
            exacting
            {...m.code.state}
          >
            <TextField {...m.code.control} uppercase autoComplete="off" spellCheck={false} />
          </Field>
        </form>
      )}
      {!started && which === 'restablecer' && (
        <form id="srv-mnt-form" className="srv-mnt-form" noValidate onSubmit={(e) => void m.submitReset(e)}>
          <p>Solo para cuando ninguna Apoderada puede entrar ni recuperar su contraseña con sus códigos.</p>
          <ErrorSummary errors={m.resetSummary} />
          <Field
            label="Apoderada"
            help="Se registrará en la bitácora y se avisará a todas las Apoderadas"
            {...m.resetFields.username.state}
          >
            {selectOf(
              m.resetFields.username.control,
              m.apoderadas.map((a) => ({ value: a.username, label: `${a.fullName} (${a.username})` })),
              'Elija la Apoderada',
            )}
          </Field>
          <div className="srv-two">
            <Field
              label="Contraseña temporal"
              help="Deberá cambiarla en su próximo ingreso"
              {...m.resetFields.password.state}
            >
              <PasswordField {...m.resetFields.password.control} autoComplete="new-password" />
            </Field>
            <Field label="Confirmar" {...m.resetFields.confirm.state}>
              <PasswordField {...m.resetFields.confirm.control} autoComplete="new-password" />
            </Field>
          </div>
          <Field
            label="Código de instalación"
            help="El código impreso que se entregó aparte"
            exacting
            {...m.resetFields.code.state}
          >
            <TextField {...m.resetFields.code.control} uppercase autoComplete="off" spellCheck={false} />
          </Field>
        </form>
      )}
      {started && (
        <div className="srv-mnt-run" aria-live="polite">
          {m.running && m.progress.steps.length === 0 && <p>Esperando el permiso de Windows…</p>}
          {m.progress.steps.length > 0 && (
            <StepList progress={m.progress} now={m.now} label="Pasos del mantenimiento" />
          )}
          {done && (
            <Notice tone="info">
              {which === 'restablecer'
                ? 'Contraseña restablecida: deberá cambiarla al entrar. Se cerraron sus sesiones y las Apoderadas recibieron el aviso.'
                : which === 'reparar'
                  ? 'El servidor quedó reparado y en marcha.'
                  : which === 'actualizar'
                    ? 'El servidor quedó actualizado y en marcha. Las apps de los dispositivos se avisan de la versión nueva.'
                    : 'El servidor volvió a arrancar.'}
            </Notice>
          )}
          {m.outcome && !m.outcome.ok && (
            <Notice tone="bad">
              {m.outcome.step === 'permisos'
                ? 'El código de instalación no es correcto. Revíselo en la hoja impresa.'
                : which === 'actualizar' && m.outcome.rolledBack
                  ? 'La actualización no se completó. El servidor volvió a la versión anterior con sus datos intactos: no se perdió nada y los dispositivos siguen conectados.'
                  : which === 'actualizar' && m.outcome.step !== 'comprobacion'
                    ? `La actualización no se completó y no se pudo volver atrás sola: ${m.outcome.error} Use «Reparar el servidor» o pida ayuda a quien instaló el sistema.`
                    : m.outcome.error}
            </Notice>
          )}
          <TechnicalLog progress={m.progress} />
        </div>
      )}
    </Dialog>
  );
}

export function ServerStatusDesktop({ m }: { m: ServerStatusModel }) {
  if (!m.status) return m.error ? <Notice tone="bad">{m.error}</Notice> : <Skeleton lines={8} />;
  return (
    <div className="srv-page">
      {m.error && <Notice tone="bad">{m.error}</Notice>}
      {m.notice && <Notice tone={m.notice.tone}>{m.notice.text}</Notice>}
      <Tiles m={m} />
      <div className="srv-cols">
        <div className="srv-col">
          <Requests m={m} />
          <Devices m={m} />
        </div>
        <div className="srv-col srv-col--side">
          {m.qr && (
            <figure className="srv-qr srv-qr--sm">
              <QrCode value={m.qr} label={`QR para emparejar con ${m.name}`} />
              <figcaption>Escanéelo en «Escanear QR del servidor»</figcaption>
            </figure>
          )}
          <MaintenanceActions m={m} />
        </div>
      </div>
      <MaintenanceDialog m={m} />
    </div>
  );
}
