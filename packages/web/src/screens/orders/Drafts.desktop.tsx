// T087 · P-14 en desktop (ui-spec P-14 y maqueta T085).
import { DraftsView } from './Drafts.parts';
import type { DraftsModel } from './useDrafts';

export function DraftsDesktop({ model }: { model: DraftsModel }) {
  return <DraftsView model={model} device="desktop" />;
}
