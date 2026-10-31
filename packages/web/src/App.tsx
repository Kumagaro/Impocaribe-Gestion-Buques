// T038 · La app: la sesión (emparejamiento y usuario) y las rutas. Router por hash: la interfaz se sirve desde app:// en
// Electron y desde los recursos de Capacitor (base relativa, DT-02), donde no hay un servidor que resuelva rutas.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';
import { appRoutes } from './app/routes';
import { MotionProvider } from './motion/MotionProvider';
import type { AppSession } from './session/app-session';
import { SessionProvider, useAppSession } from './session/SessionProvider';
import { applyTheme } from './ui/tokens';

/** P-05 y RF-UI-06: el tema y "Reducir animaciones" de este dispositivo valen para toda la app. */
function DevicePreferences({ children }: { children: ReactNode }) {
  const { theme, reduceMotion } = useAppSession().state.preferences;
  useEffect(() => applyTheme(document.documentElement, theme), [theme]);
  return <MotionProvider reduceMotion={reduceMotion}>{children}</MotionProvider>;
}

export function App({ session }: { session: AppSession }) {
  const [router] = useState(() => createHashRouter(appRoutes));
  // Plan §7.1: las lecturas vienen de la copia local; nada que reintentar ni que caducar por tiempo.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={session}>
        <DevicePreferences>
          <RouterProvider router={router} />
        </DevicePreferences>
      </SessionProvider>
    </QueryClientProvider>
  );
}
