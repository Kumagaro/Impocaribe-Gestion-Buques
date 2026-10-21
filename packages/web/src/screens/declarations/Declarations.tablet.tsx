// T072 · P-09 a P-11 en tablet (ui-spec y maqueta T070).
import { DeclarationsView } from './Declarations.parts';
import type { DeclarationsModel } from './useDeclarations';

export function DeclarationsTablet({ model }: { model: DeclarationsModel }) {
  return <DeclarationsView model={model} device="tablet" />;
}
