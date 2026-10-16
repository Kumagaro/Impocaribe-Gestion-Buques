// T022 · DT-13: Motion con carga reducida (LazyMotion + domAnimation) y una sola fuente de "movimiento reducido": la
// preferencia del sistema operativo o la del perfil ("Reducir animaciones", por dispositivo, RF-UI-06).
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

const UserReduceMotion = createContext(false);
const QUERY = '(prefers-reduced-motion: reduce)';

// Preferencia del sistema, al día si cambia con la app abierta.
function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = matchMedia(QUERY);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => matchMedia(QUERY).matches,
  );
}

export function MotionProvider({ reduceMotion, children }: { reduceMotion: boolean; children: ReactNode }) {
  return (
    <UserReduceMotion.Provider value={reduceMotion}>
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>{children}</MotionConfig>
      </LazyMotion>
    </UserReduceMotion.Provider>
  );
}

/** ¿Hay que usar las variantes reducidas? Sí si lo pide el sistema o el usuario. */
export function useReducedMotionPreference(): boolean {
  const user = useContext(UserReduceMotion);
  const system = useSystemReducedMotion();
  return user || system;
}
