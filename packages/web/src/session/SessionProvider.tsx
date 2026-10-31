// T038 · El estado de la sesión al alcance de las pantallas (sus hooks de lógica, no las presentaciones).
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { AppSession, SessionState } from './app-session';

const SessionContext = createContext<AppSession | null>(null);

export function SessionProvider({ session, children }: { session: AppSession; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** La sesión o null: para las bandas del armazón, que las historias muestran sin SessionProvider. */
export const useOptionalSession = (): AppSession | null => useContext(SessionContext);

export function useAppSession(): { session: AppSession; state: SessionState } {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useAppSession fuera de SessionProvider');
  const state = useSyncExternalStore(session.subscribe, session.getState);
  return { session, state };
}
