// T048 · P-30 en desktop: semáforo arriba y detalle en dos columnas (ui-spec P-30 y maqueta T037).
import { DiagnosticsColumns } from './DiagnosticsColumns';
import type { DiagnosticsModel } from './useDiagnostics';

export function DiagnosticsDesktop({ model }: { model: DiagnosticsModel }) {
  return <DiagnosticsColumns model={model} />;
}
