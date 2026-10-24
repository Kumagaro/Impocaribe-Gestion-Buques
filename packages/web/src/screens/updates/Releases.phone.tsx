// T114 · P-26 en phone (maqueta T114).
import { ReleasesView } from './Releases.parts';
import type { ReleasesModel } from './useReleases';

export function ReleasesPhone({ model }: { model: ReleasesModel }) {
  return <ReleasesView model={model} device="phone" />;
}
