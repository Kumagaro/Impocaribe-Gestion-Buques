// T101 · P-12 en tablet (ui-spec P-12 y maqueta T099).
import { SearchView } from './Search.parts';
import type { SearchModel } from './useSearch';

export function SearchTablet({ model }: { model: SearchModel }) {
  return <SearchView model={model} device="tablet" />;
}
