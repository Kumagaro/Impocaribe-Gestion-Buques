// T072 · P-09 DM, P-10 Ficha y P-11 Alta y edición: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { DeclarationsDesktop } from './Declarations.desktop';
import { DeclarationsPhone } from './Declarations.phone';
import { DeclarationsTablet } from './Declarations.tablet';
import { useDeclarations } from './useDeclarations';

const VIEWS = { phone: DeclarationsPhone, tablet: DeclarationsTablet, desktop: DeclarationsDesktop };

export function DeclarationsScreen() {
  const model = useDeclarations();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
