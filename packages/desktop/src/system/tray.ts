// T116 · RF-ALR-01 y plan §10.1: la app de escritorio vive en la bandeja. Cerrar la ventana la oculta (la conexión de
// alertas sigue y las notificaciones siguen llegando); solo «Salir» la cierra de verdad. «Iniciar con Windows» la abre
// oculta, en la bandeja, al entrar en la sesión de Windows.

/** El argumento con que Windows la abre al iniciar sesión: arranca en la bandeja, sin ventana. */
export const HIDDEN_ARG = '--en-bandeja';

export interface TrayActions {
  open(): void;
  setStartWithWindows(enabled: boolean): void;
  quit(): void;
}

/** El menú de la bandeja, en la forma de `Menu.buildFromTemplate`. */
export function trayMenu(startsWithWindows: boolean, actions: TrayActions) {
  return [
    { label: 'Abrir Órdenes de Carga', click: () => actions.open() },
    { type: 'separator' as const },
    {
      label: 'Iniciar con Windows',
      type: 'checkbox' as const,
      checked: startsWithWindows,
      click: (item: { checked: boolean }) => actions.setStartWithWindows(item.checked),
    },
    { type: 'separator' as const },
    { label: 'Salir', click: () => actions.quit() },
  ];
}

/** Lo que pide `app.setLoginItemSettings`: abrir al iniciar sesión, en la bandeja. */
export const loginItem = (enabled: boolean) => ({ openAtLogin: enabled, args: [HIDDEN_ARG] });

/** Cerrar la ventana la oculta, salvo cuando la app de verdad se está cerrando («Salir», apagado o actualización). */
export const hideOnClose = (quitting: boolean) => !quitting;

/** Abierta por Windows al iniciar sesión: sin ventana a la vista. */
export const startsHidden = (argv: readonly string[]) => argv.includes(HIDDEN_ARG);

/** El filtro de «Guardar como» según la extensión del archivo (RF-ORD-22: el PDF de la orden). */
export function saveFilters(name: string) {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext === 'pdf') return [{ name: 'Documento PDF', extensions: ['pdf'] }];
  return ext ? [{ name: `Archivo .${ext}`, extensions: [ext] }] : [];
}
