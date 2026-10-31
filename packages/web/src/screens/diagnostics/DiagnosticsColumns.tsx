// T048 · P-30 en TAB y ESC: semáforo arriba y detalle en dos columnas (ui-spec P-30 y maqueta T037).
import { Details, Light, Retry, Steps } from './DiagnosticsParts';
import type { DiagnosticsModel } from './useDiagnostics';

export function DiagnosticsColumns({ model }: { model: DiagnosticsModel }) {
  return (
    <div className="diag" data-layout="columns">
      <div className="diag-top">
        <Light model={model} />
        <Retry model={model} />
      </div>
      <div className="diag-columns">
        <Details model={model} />
        <Steps model={model} />
      </div>
    </div>
  );
}
