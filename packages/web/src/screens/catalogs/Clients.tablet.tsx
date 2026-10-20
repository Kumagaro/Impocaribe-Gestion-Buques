// T059 · P-19 en tablet (ui-spec P-19 y maqueta T057).
import { ClientsView } from './Clients.parts';
import type { ClientsModel } from './useClients';

export function ClientsTablet({ model }: { model: ClientsModel }) {
  return <ClientsView model={model} device="tablet" />;
}
