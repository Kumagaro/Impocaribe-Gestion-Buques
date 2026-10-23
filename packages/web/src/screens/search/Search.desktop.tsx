// T101 · P-12 en desktop (ui-spec P-12 y maqueta T099).
import { SearchView } from './Search.parts';
import type { SearchModel } from './useSearch';

export function SearchDesktop({ model }: { model: SearchModel }) {
  return <SearchView model={model} device="desktop" />;
}
