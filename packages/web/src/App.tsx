// T038 · La app: la sesión (emparejamiento y usuario) y las rutas. Router por hash: la interfaz se sirve desde app:// en
// Electron y desde los recursos de Capacitor (base relativa, DT-02), donde no hay un servidor que resuelva rutas.
import { useState } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';
import { appRoutes } from './app/routes';
import type { AppSession } from './session/app-session';
import { SessionProvider } from './session/SessionProvider';

export function App({ session }: { session: AppSession }) {
  const [router] = useState(() => createHashRouter(appRoutes));
  return (
    <SessionProvider session={session}>
      <RouterProvider router={router} />
    </SessionProvider>
  );
}
