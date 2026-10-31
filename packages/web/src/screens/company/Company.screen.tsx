// T054 · P-22 Empresa: la lógica y la presentación de la clase de dispositivo (plan §7.3). Sin conexión no hay datos que
// mostrar: la firma y el cuño solo se consultan en línea (plan §4.4).
import { useDeviceClass } from '../../ui/device';
import { ErrorState, Skeleton } from '../../ui/presentation';
import { CompanyDesktop } from './Company.desktop';
import { CompanyPhone } from './Company.phone';
import { CompanyTablet } from './Company.tablet';
import { useCompany } from './useCompany';

const VIEWS = { phone: CompanyPhone, tablet: CompanyTablet, desktop: CompanyDesktop };

export function CompanyScreen() {
  const model = useCompany();
  const View = VIEWS[useDeviceClass()];
  if (model.data.status === 'loading') return <Skeleton lines={8} />;
  if (model.data.status === 'error') return <ErrorState message={model.data.message} onRetry={model.reload} />;
  return <View model={model} data={model.data} />;
}
