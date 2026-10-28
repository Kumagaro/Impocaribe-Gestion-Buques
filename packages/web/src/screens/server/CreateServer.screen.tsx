// T127 · P-28 Crear servidor: solo en escritorio y con el instalador completo (ui-spec P-28; excepción a las tres
// clases de dispositivo, Const. art. XIV.1). En una ventana estrecha se apila, pero es la misma presentación.
import { CreateServerDesktop } from './CreateServer.desktop';
import { useCreateServer } from './useCreateServer';

export function CreateServerScreen() {
  const model = useCreateServer();
  if (!model.available) return null;
  return <CreateServerDesktop m={model} />;
}
