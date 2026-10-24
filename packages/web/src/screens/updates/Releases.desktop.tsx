// T114 · P-26 en desktop (maqueta T114).
import { ReleasesView } from './Releases.parts';
import type { ReleasesModel } from './useReleases';

export function ReleasesDesktop({ model }: { model: ReleasesModel }) {
  return <ReleasesView model={model} device="desktop" />;
}
