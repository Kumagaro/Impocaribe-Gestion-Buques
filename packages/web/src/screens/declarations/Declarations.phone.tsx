// T072 · P-09 a P-11 en phone (ui-spec y maqueta T070).
import { DeclarationsView } from './Declarations.parts';
import type { DeclarationsModel } from './useDeclarations';

export function DeclarationsPhone({ model }: { model: DeclarationsModel }) {
  return <DeclarationsView model={model} device="phone" />;
}
