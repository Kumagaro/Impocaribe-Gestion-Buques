// T092 · RF-ALR-03, 05: el catálogo de alertas (spec §5.13): de condición (se resuelven solas), de evento (se atienden)
// y solo locales (no se guardan en el servidor). Quién las ve y quién las atiende, según la tabla AL.
import type { Role } from './permissions.ts';

export type AlertKind = 'condition' | 'event' | 'local';

export interface AlertSpec {
  kind: AlertKind;
  label: string;
  /** Roles que la ven. AL-08 la ve además su autor. */
  see: readonly Role[];
  /** Roles que la atienden (solo las de evento). */
  attend: readonly Role[];
}

const A = ['apoderada'] as const;
const AO = ['apoderada', 'operador'] as const;
const AOL = ['apoderada', 'operador', 'lectura'] as const;
const NONE = [] as const;

export const ALERTS = {
  'AL-01': { kind: 'condition', label: 'DM pendiente', see: AOL, attend: NONE },
  'AL-02': { kind: 'event', label: 'DM nueva con otras pendientes', see: AO, attend: AO },
  'AL-03': { kind: 'condition', label: 'DM en el día 25 del plazo', see: AOL, attend: NONE },
  'AL-04': { kind: 'event', label: 'DM vencida', see: AOL, attend: AO },
  'AL-05': { kind: 'event', label: 'Sobregiro bloqueado', see: A, attend: A },
  'AL-06': { kind: 'event', label: 'Orden por encima de la capacidad', see: A, attend: A },
  'AL-07': { kind: 'event', label: 'Camión con dos órdenes el mismo día', see: A, attend: A },
  'AL-08': { kind: 'condition', label: 'Borrador compartido sin emitir', see: A, attend: NONE },
  'AL-09': { kind: 'condition', label: 'DM sin movimiento', see: AOL, attend: NONE },
  'AL-10': { kind: 'event', label: 'Asignación parcial', see: AO, attend: AO },
  'AL-11': { kind: 'event', label: 'Recuperación de contraseña', see: A, attend: A },
  'AL-12': { kind: 'condition', label: 'Respaldo atrasado o fallido', see: A, attend: NONE },
  'AL-13': { kind: 'local', label: 'Sin conexión con el servidor', see: AOL, attend: NONE },
  'AL-14': { kind: 'local', label: 'Borradores sin subir', see: AOL, attend: NONE },
  'AL-15': { kind: 'local', label: 'Versión nueva de la app', see: AOL, attend: NONE },
  'AL-16': { kind: 'condition', label: 'Falta la firma o el cuño oficial', see: AO, attend: NONE },
  'AL-17': { kind: 'condition', label: 'Buque cerrado con sobrante sin destino', see: AO, attend: NONE },
  'AL-18': { kind: 'condition', label: 'Hora de un dispositivo desfasada', see: A, attend: NONE },
  'AL-19': { kind: 'condition', label: 'Órdenes perdidas por recuperar', see: A, attend: NONE },
  'AL-20': { kind: 'condition', label: 'Servidor con batería', see: AOL, attend: NONE },
  'AL-21': { kind: 'condition', label: 'Cerca del límite del hotspot', see: A, attend: NONE },
  'AL-23': { kind: 'condition', label: 'Contraseña de respaldo sin confirmar', see: A, attend: NONE },
} as const satisfies Record<string, AlertSpec>;

export type AlertType = keyof typeof ALERTS;
export const ALERT_TYPES = Object.keys(ALERTS) as AlertType[];
/** Las que guarda el servidor (sin las solo locales). */
export const SERVER_ALERT_TYPES = ALERT_TYPES.filter((t) => ALERTS[t].kind !== 'local');

/** ¿La ve este rol (o este usuario, si es el autor de AL-08)? */
export function seesAlert(type: AlertType, role: Role, isTarget = false): boolean {
  return isTarget || (ALERTS[type].see as readonly Role[]).includes(role);
}

/** ¿La puede atender este rol? Solo las de evento (RF-ALR-03). */
export function attendsAlert(type: AlertType, role: Role): boolean {
  return (ALERTS[type].attend as readonly Role[]).includes(role);
}
