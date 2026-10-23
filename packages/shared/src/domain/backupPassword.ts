// T105 · RF-RES-08, AL-23: la contraseña de respaldo se confirma cada 90 días; al iniciar sesión, una Apoderada puede
// aplazarlo hasta 3 veces, un día cada vez. Pasados los 90 días sin confirmarla, AL-23 sigue abierta hasta que alguien la
// confirme o la cambie.

export const CONFIRM_EVERY_DAYS = 90;
export const MAX_POSTPONES = 3;
export const POSTPONE_MS = 24 * 3_600_000;
const DAY_MS = 86_400_000;

export interface BackupPasswordState {
  /** Cuándo se definió o se cambió por última vez; null si no hay contraseña. */
  setAt: Date | null;
  confirmedAt: Date | null;
  postpones: number;
  postponedUntil: Date | null;
}

/** Han pasado 90 días desde la última confirmación (o desde que se definió). */
export function confirmationOverdue(s: BackupPasswordState, now: Date): boolean {
  const since = s.confirmedAt ?? s.setAt;
  return since !== null && now.getTime() - since.getTime() >= CONFIRM_EVERY_DAYS * DAY_MS;
}

/** Al iniciar sesión, una Apoderada debe confirmarla ahora (vencida y sin un aplazamiento en curso). */
export function confirmationDue(s: BackupPasswordState, now: Date): boolean {
  return confirmationOverdue(s, now) && (s.postponedUntil === null || now >= s.postponedUntil);
}

export const postponesLeft = (s: BackupPasswordState) => Math.max(0, MAX_POSTPONES - s.postpones);
