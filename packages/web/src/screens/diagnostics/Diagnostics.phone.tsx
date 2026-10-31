// T048 · P-30 en phone: tarjetas apiladas (ui-spec P-30 y maqueta T037).
import { Details, Light, Retry, Steps } from './DiagnosticsParts';
import type { DiagnosticsModel } from './useDiagnostics';

export function DiagnosticsPhone({ model }: { model: DiagnosticsModel }) {
  return (
    <div className="diag" data-layout="stack">
      <Light model={model} />
      <Steps model={model} />
      <Details model={model} />
      <Retry model={model} />
    </div>
  );
}
