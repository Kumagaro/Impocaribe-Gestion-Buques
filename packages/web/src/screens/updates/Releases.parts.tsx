// T114 · P-26 Versiones de la app (maqueta T114): la versión de este dispositivo, las versiones por plataforma (tabla en
// TAB y ESC, tarjetas en TEL) con la mínima y sus novedades, publicar (diálogo; hoja en TEL) y marcar la mínima con
// lo que pasará.
import { havanaDateTime } from '@impocaribe/shared';
import { PLATFORM_LABELS, RELEASE_PLATFORMS, type ReleaseDto } from '@impocaribe/shared/validation';
import { CloudOff, Upload } from 'lucide-react';
import { useRef } from 'react';
import { Button, Select, TextField } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { Field } from '../../ui/form';
import { Dialog, Sheet } from '../../ui/overlays';
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from '../../ui/presentation';
import { blocked } from '../catalogs/CatalogLayout';
import type { ReleasesModel } from './useReleases';

/** «02/10 09:05»: el día y el mes con dos cifras (es-CU no las rellena sin el año). */
const dropYear = (s: string) => `${s.slice(0, 5)}${s.slice(10)}`;
const when = (iso: string) => dropYear(havanaDateTime(new Date(iso)));
const size = (b: number) => `${(b / 1_048_576).toFixed(1).replace('.', ',')} MB`;
const devices = (n: number) => (n === 1 ? '1 dispositivo' : `${n} dispositivos`);

function Tags({ m, r }: { m: ReleasesModel; r: ReleaseDto }) {
  return (
    <>
      {m.latestOf(r.platform)?.id === r.id && <Badge tone="info">La más nueva</Badge>}
      {r.isMinSupported && <Badge tone="warn">Mínima</Badge>}
    </>
  );
}

function MinButton({ m, r }: { m: ReleasesModel; r: ReleaseDto }) {
  if (!m.canPublish || !m.isApp || r.isMinSupported) return null;
  return (
    <Button
      variant="ghost"
      aria-label={`Marcar la ${r.version} como mínima`}
      onClick={() => m.askMin(r)}
      {...blocked(m.offlineReason)}
    >
      Marcar como mínima
    </Button>
  );
}

function Table({ m }: { m: ReleasesModel }) {
  return (
    <div className="ui-table-scroll">
      <table className="ui-table releases-table">
        <caption className="ui-visually-hidden">{`Versiones de ${PLATFORM_LABELS[m.platform]}`}</caption>
        <thead>
          <tr>
            <th scope="col">Versión</th>
            <th scope="col">Publicada</th>
            <th scope="col">Por</th>
            <th scope="col" className="releases-r">
              Tamaño
            </th>
            <th scope="col">Novedades</th>
            <th scope="col">
              <span className="ui-visually-hidden">Acción</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {m.releases.map((r) => (
            <tr key={r.id} aria-label={`Versión ${r.version}`}>
              <td>
                <span className="releases-version">
                  <b className="releases-num">{r.version}</b>
                  <Tags m={m} r={r} />
                </span>
              </td>
              <td className="releases-num">{when(r.publishedAt)}</td>
              <td>{r.publishedByName ?? '—'}</td>
              <td className="releases-num releases-r">{size(r.sizeBytes)}</td>
              <td className="releases-notes">{r.notes || '—'}</td>
              <td>
                <MinButton m={m} r={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cards({ m }: { m: ReleasesModel }) {
  return (
    <div className="catalog-cards" role="list" aria-label={`Versiones de ${PLATFORM_LABELS[m.platform]}`}>
      {m.releases.map((r) => (
        <div key={r.id} role="listitem" className="releases-item" aria-label={`Versión ${r.version}`}>
          <div className="releases-version">
            <b className="releases-num">{r.version}</b>
            <Tags m={m} r={r} />
          </div>
          <span className="catalog-text">{`${when(r.publishedAt)} · ${r.publishedByName ?? '—'} · ${size(r.sizeBytes)}`}</span>
          {r.notes && <span className="releases-notes">{r.notes}</span>}
          <MinButton m={m} r={r} />
        </div>
      ))}
    </div>
  );
}

function FilePicker(p: {
  id: string;
  label: string;
  help?: string;
  accept: string;
  file: File | null;
  error: string | undefined;
  onPick: (file: File | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Field id={p.id} label={p.label} {...(p.help ? { help: p.help } : {})} error={p.error}>
      <div className="releases-file">
        <input
          ref={input}
          id={p.id}
          type="file"
          accept={p.accept}
          className="releases-file__input"
          tabIndex={-1}
          aria-describedby={`${p.id}-msg`}
          aria-invalid={p.error ? true : undefined}
          onChange={(e) => p.onPick(e.target.files?.[0] ?? null)}
        />
        <span className="releases-file__name">
          {p.file ? `${p.file.name} · ${size(p.file.size)}` : 'Sin archivo elegido'}
        </span>
        <Button variant="ghost" icon={<Upload size={16} aria-hidden="true" />} onClick={() => input.current?.click()}>
          {p.file ? 'Cambiar' : 'Elegir archivo'}
        </Button>
      </div>
    </Field>
  );
}

function PublishForm({ m }: { m: ReleasesModel }) {
  const f = m.form!;
  const last = m.latestOf(f.platform);
  return (
    <div className="releases-form">
      {m.formError && <Notice tone="bad">{m.formError}</Notice>}
      <Field id="version-plataforma" label="Plataforma" error={m.errors.platform}>
        <Select
          id="version-plataforma"
          options={RELEASE_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))}
          value={f.platform}
          onValueChange={(v) => m.setField('platform', v as typeof f.platform)}
        />
      </Field>
      <Field
        id="version-numero"
        label="Versión"
        help={`Tres números separados por puntos.${last ? ` La última es la ${last.version}.` : ''}`}
        error={m.errors.version}
      >
        <TextField
          id="version-numero"
          inputMode="decimal"
          placeholder="1.4.0"
          value={f.version}
          onValueChange={(v) => m.setField('version', v)}
          invalid={!!m.errors.version}
          aria-describedby="version-numero-msg"
        />
      </Field>
      <Field
        id="version-novedades"
        label="Novedades"
        help="Lo que verán los usuarios en el aviso"
        error={m.errors.notes}
      >
        <textarea
          id="version-novedades"
          className="ui-input ui-textarea"
          rows={3}
          maxLength={2000}
          value={f.notes}
          aria-describedby="version-novedades-msg"
          onChange={(e) => m.setField('notes', e.target.value)}
        />
      </Field>
      <FilePicker
        id="version-archivo"
        label="Archivo"
        accept={f.platform === 'windows' ? '.exe' : '.apk'}
        file={f.file}
        error={m.errors.file}
        onPick={(file) => m.setField('file', file)}
      />
      {/* T117: la app de Windows no abre una actualización sin la firma del proyecto (Android exige la del APK). */}
      {f.platform === 'windows' && (
        <FilePicker
          id="version-firma"
          label="Firma (.sig)"
          help="El archivo .sig que dejó el build junto al instalador"
          accept=".sig"
          file={f.signature}
          error={m.errors.signature}
          onPick={(file) => m.setField('signature', file)}
        />
      )}
      {m.uploading && f.file && <p className="catalog-text" role="status">{`Subiendo ${size(f.file.size)}…`}</p>}
    </div>
  );
}

function Dialogs({ m, device }: { m: ReleasesModel; device: DeviceClass }) {
  const footer = (
    <>
      <Button variant="ghost" onClick={m.closePublish} disabled={m.uploading}>
        Cancelar
      </Button>
      <Button onClick={() => void m.publish()} busy={m.uploading} busyLabel="Publicando…" {...blocked(m.offlineReason)}>
        Publicar
      </Button>
    </>
  );
  const Overlay = device === 'phone' ? Sheet : Dialog;
  const c = m.confirming;
  return (
    <>
      {m.form && (
        <Overlay title="Publicar una versión" onClose={m.closePublish} footer={footer}>
          <PublishForm m={m} />
        </Overlay>
      )}
      {c && (
        <Dialog
          title={`Marcar la ${c.version} de ${PLATFORM_LABELS[c.platform]} como mínima`}
          onClose={m.cancelMin}
          footer={
            <>
              <Button variant="ghost" onClick={m.cancelMin}>
                Cancelar
              </Button>
              <Button
                onClick={m.markMin}
                busy={m.busy === 'minima'}
                busyLabel="Marcando…"
                {...blocked(m.offlineReason)}
              >
                Marcar como mínima
              </Button>
            </>
          }
        >
          <div className="releases-consequence">
            <b>Lo que pasará</b>
            <ul>
              <li>{`Los dispositivos con una versión anterior a la ${c.version} dejan de escribir y sincronizar hasta actualizar.`}</li>
              <li>Al conectarse ven la pantalla «Hay que actualizar la app» con el botón para hacerlo.</li>
              <li>
                {c.devicesBelow === 0
                  ? 'Ahora no hay ningún dispositivo con una versión anterior.'
                  : `Ahora hay ${devices(c.devicesBelow)} con una versión anterior.`}
              </li>
            </ul>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function ReleasesView({ model: m, device }: { model: ReleasesModel; device: DeviceClass }) {
  if (!m.connected)
    return (
      <EmptyState
        icon={<CloudOff aria-hidden="true" />}
        title="Las versiones se consultan en el servidor."
        description="Sin conexión no se pueden ver. Vuelva a intentarlo cuando el dispositivo se conecte."
      />
    );
  const t = m.thisDevice;
  const list = m.loading ? (
    <Skeleton lines={5} />
  ) : m.failed ? (
    <ErrorState message="No se pudo leer la lista de versiones." onRetry={m.retry} />
  ) : m.releases.length === 0 ? (
    <EmptyState title={`Todavía no hay versiones de ${PLATFORM_LABELS[m.platform]} publicadas.`} />
  ) : device === 'phone' ? (
    <Cards m={m} />
  ) : (
    <Table m={m} />
  );
  return (
    <div className="releases-page">
      <div className="releases-top">
        <span className="catalog-text">
          {`${t.label}: ${t.version} · ${t.newer ? `hay una nueva (${t.newer})` : 'al día'}`}
        </span>
        {m.canPublish && (
          <Button onClick={m.openPublish} {...blocked(m.offlineReason)}>
            Publicar una versión
          </Button>
        )}
      </div>
      {m.notice && <Notice tone={m.notice.tone}>{m.notice.text}</Notice>}
      <div className="catalog-chips" role="group" aria-label="Plataforma">
        {RELEASE_PLATFORMS.map((p) => (
          <button key={p} type="button" aria-pressed={m.platform === p} onClick={() => m.setPlatform(p)}>
            {PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>
      {list}
      <Dialogs m={m} device={device} />
    </div>
  );
}
