// T128 · P-29 Estado del servidor: solo en escritorio y en la PC servidor (ui-spec P-29; excepción a las tres clases de
// dispositivo, Const. art. XIV.1). En una ventana estrecha se apila, pero es la misma presentación.
import { ServerStatusDesktop } from './ServerStatus.desktop';
import { useServerStatus } from './useServerStatus';

export function ServerStatusScreen() {
  return <ServerStatusDesktop m={useServerStatus()} />;
}
