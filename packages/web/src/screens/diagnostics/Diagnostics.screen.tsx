// T048 · P-30 Diagnóstico de red: la lógica y la presentación de la clase de dispositivo (plan §7.3).
import { useDeviceClass } from '../../ui/device';
import { DiagnosticsDesktop } from './Diagnostics.desktop';
import { DiagnosticsPhone } from './Diagnostics.phone';
import { DiagnosticsTablet } from './Diagnostics.tablet';
import { useDiagnostics } from './useDiagnostics';

const VIEWS = { phone: DiagnosticsPhone, tablet: DiagnosticsTablet, desktop: DiagnosticsDesktop };

export function DiagnosticsScreen() {
  const model = useDiagnostics();
  const View = VIEWS[useDeviceClass()];
  return <View model={model} />;
}
