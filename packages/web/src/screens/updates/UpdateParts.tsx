// T114 · maqueta T114: la banda de versión nueva (AL-15), con la descarga y su progreso, y la pantalla de actualización
// obligatoria (EST-07), que solo deja ver los borradores locales.
import { Button } from '../../ui/controls';
import { ProgressBar } from '../../ui/presentation';
import { megabytes, useAppUpdate, type AppUpdate } from './AppUpdateProvider';

/** Por qué no se puede actualizar ahora, si no se puede. */
const blocked = (u: AppUpdate) =>
  !u.latest
    ? { disabledReason: 'Todavía no hay una versión publicada en el servidor.' }
    : u.canInstall
      ? {}
      : { disabledReason: 'Esta app se actualiza con su instalador: aquí no se puede.' };

function Progress({ u, version }: { u: AppUpdate; version: string }) {
  const p = u.progress;
  return (
    <div className="update-progress">
      <ProgressBar label={`Descargando la ${version}`} value={p && p.total > 0 ? (p.received / p.total) * 100 : 0} />
      <span>
        {p
          ? `Descargando la ${version}… ${megabytes(p.received, p.total)}`
          : `Preparando la descarga de la ${version}…`}
      </span>
    </div>
  );
}

/** AL-15 (RF-UPD-03): arriba de todas las pantallas mientras haya una nueva y no se pidió «Más tarde». */
export function UpdateBand() {
  const u = useAppUpdate();
  // EST-07 en los borradores: se recuerda por qué no se puede hacer nada más.
  if (u?.requiredMin)
    return (
      <div role="status" className="ui-band update-band" data-tone="bad">
        {u.installing && u.latest ? (
          <Progress u={u} version={u.latest} />
        ) : (
          <>
            <span className="update-band__text">
              {`Esta versión (${u.current}) ya no es compatible: solo puede ver sus borradores.`}
            </span>
            <span className="update-band__actions">
              <Button onClick={u.install} {...blocked(u)}>
                Actualizar ahora
              </Button>
            </span>
          </>
        )}
      </div>
    );
  if (!u?.latest || (!u.showBand && !u.installing && !u.error)) return null;
  return (
    <div role="status" className="ui-band update-band">
      {u.installing ? (
        <Progress u={u} version={u.latest} />
      ) : (
        <>
          <span className="update-band__text">
            <b>{`Hay una versión nueva: ${u.latest}.`}</b>
            {u.notes && ` ${u.notes}`}
            {u.error && <span className="update-band__error">{` ${u.error}`}</span>}
          </span>
          <span className="update-band__actions">
            <Button variant="ghost" onClick={u.later}>
              Más tarde
            </Button>
            <Button onClick={u.install} {...blocked(u)}>
              Actualizar ahora
            </Button>
          </span>
        </>
      )}
    </div>
  );
}

/** EST-07 (RF-UPD-04): pantalla completa; mientras tanto, solo los borradores de este dispositivo. */
export function UpgradeRequired({ drafts, onDrafts }: { drafts: number; onDrafts: () => void }) {
  const u = useAppUpdate();
  if (!u?.requiredMin) return null;
  const target = u.latest ?? u.requiredMin;
  return (
    <main className="update-required">
      <section className="update-required__box" aria-labelledby="actualizar-titulo">
        <h1 id="actualizar-titulo">Hay que actualizar la app</h1>
        <p>
          {`Esta versión (${u.current}) ya no es compatible con el servidor. `}
          {u.latest
            ? `La ${u.latest} está lista para instalar desde el servidor local.`
            : `Hace falta la ${u.requiredMin} o una posterior; pida al responsable que la publique en el servidor.`}
        </p>
        {u.installing ? (
          <Progress u={u} version={target} />
        ) : (
          <Button onClick={u.install} {...blocked(u)}>
            Actualizar ahora
          </Button>
        )}
        {u.error && (
          <p role="alert" className="update-required__error">
            {u.error}
          </p>
        )}
        <button type="button" className="update-required__link" onClick={onDrafts}>
          {drafts > 0 ? `Ver mis borradores (${drafts})` : 'Ver mis borradores'}
        </button>
      </section>
    </main>
  );
}
