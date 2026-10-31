// T087 · P-14 en tablet (ui-spec P-14 y maqueta T085).
import { DraftsView } from './Drafts.parts';
import type { DraftsModel } from './useDrafts';

export function DraftsTablet({ model }: { model: DraftsModel }) {
  return <DraftsView model={model} device="tablet" />;
}
