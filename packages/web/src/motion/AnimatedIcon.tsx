// T022 · DT-14, MOV-08: iconos Lucide con estado animado. Con movimiento reducido quedan estáticos.
import { Bell, Check, CloudOff, Lock, RefreshCw, type LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import { useReducedMotionPreference } from './MotionProvider';

const ICONS = { bell: Bell, sync: RefreshCw, offline: CloudOff, lock: Lock, check: Check } satisfies Record<
  string,
  LucideIcon
>;

export type IconName = keyof typeof ICONS;
export type IconState = 'idle' | 'ring' | 'spin' | 'pulse' | 'lock' | 'draw';

// Campana que se agita, flechas que giran, nube que late, candado que se cierra y marca que se dibuja. Las transiciones
// duran como mucho 300 ms; la sincronización y la falta de conexión son estados continuos.
const ANIMATIONS = {
  idle: {},
  ring: { animate: { rotate: [0, 14, -12, 6, 0] }, transition: { duration: 0.3 } },
  spin: { animate: { rotate: 360 }, transition: { duration: 1, repeat: Infinity, ease: 'linear' } },
  pulse: { animate: { opacity: [1, 0.35, 1] }, transition: { duration: 1.6, repeat: Infinity } },
  lock: { initial: { y: -3 }, animate: { y: 0 }, transition: { duration: 0.2 } },
  draw: { initial: { scale: 0.6, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { duration: 0.2 } },
} as const;

export function AnimatedIcon({
  name,
  state,
  label,
  size = 20,
}: {
  name: IconName;
  state: IconState;
  label?: string;
  size?: number;
}) {
  const reduced = useReducedMotionPreference();
  const Icon = ICONS[name];
  return (
    <m.span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-motion={reduced ? 'static' : state}
      style={{ display: 'inline-flex', transformOrigin: name === 'bell' ? '50% 10%' : '50% 50%' }}
      {...(reduced ? {} : ANIMATIONS[state])}
    >
      <Icon size={size} aria-hidden="true" />
    </m.span>
  );
}
