// T101 · P-12 Buscar: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { SearchDesktop } from './Search.desktop';
import { SearchPhone } from './Search.phone';
import { SearchTablet } from './Search.tablet';
import { useSearch } from './useSearch';

const VIEWS = { phone: SearchPhone, tablet: SearchTablet, desktop: SearchDesktop };

export function SearchScreen() {
  const model = useSearch();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
