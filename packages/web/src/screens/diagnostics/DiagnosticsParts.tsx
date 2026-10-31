// T048 · P-30: el semáforo, qué hacer y el detalle, iguales en las tres clases; cada presentación los coloca.
import { RefreshCw } from 'lucide-react';
import { AnimatedIcon } from '../../motion/AnimatedIcon';
import { Button } from '../../ui/controls';
import type { DiagnosticsModel } from './useDiagnostics';

export function Light({ model }: { model: DiagnosticsModel }) {
  return (
    <div role="status" aria-label={model.title} className="diag-light" data-tone={model.tone}>
      {model.verdict === 'checking' ? (
        <AnimatedIcon name="sync" state="spin" />
      ) : (
        <span className="diag-light__dot" aria-hidden="true" />
      )}
      <div>
        <b>{model.title}</b>
        <span>{model.message}</span>
      </div>
    </div>
  );
}

export function Steps({ model }: { model: DiagnosticsModel }) {
  if (model.steps.length === 0) return null;
  return (
    <section className="diag-card" aria-labelledby="diag-steps">
      <h2 id="diag-steps">Qué hacer</h2>
      <ol aria-label="Qué hacer">
        {model.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </section>
  );
}

export function Details({ model }: { model: DiagnosticsModel }) {
  return (
    <section className="diag-card" aria-labelledby="diag-details">
      <h2 id="diag-details">Conexión</h2>
      <ul className="diag-details" aria-label="Detalle de la conexión">
        {model.details.map((d) => (
          <li key={d.label}>
            <span>{d.label}</span>
            <b>{d.value}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Retry({ model }: { model: DiagnosticsModel }) {
  return (
    <Button
      variant="secondary"
      icon={<RefreshCw size={18} aria-hidden="true" />}
      onClick={model.retry}
      busy={model.running}
      busyLabel="Probando…"
    >
      Volver a probar
    </Button>
  );
}
