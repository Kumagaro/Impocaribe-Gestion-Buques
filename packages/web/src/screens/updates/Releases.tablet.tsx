// T114 · P-26 en tablet (maqueta T114).
import { ReleasesView } from './Releases.parts';
import type { ReleasesModel } from './useReleases';

export function ReleasesTablet({ model }: { model: ReleasesModel }) {
  return <ReleasesView model={model} device="tablet" />;
}
