import { describe, expect, it } from 'vitest';
import { confirmationDue, confirmationOverdue, postponesLeft, type BackupPasswordState } from './backupPassword.ts';

// T105 · RF-RES-08.
const at = (iso: string) => new Date(iso);
const state = (extra: Partial<BackupPasswordState> = {}): BackupPasswordState => ({
  setAt: at('2026-01-01T12:00:00.000Z'),
  confirmedAt: null,
  postpones: 0,
  postponedUntil: null,
  ...extra,
});

describe('confirmación periódica de la contraseña de respaldo', () => {
  it('a los 90 días exactos de definirla (o de la última confirmación) toca confirmarla', () => {
    expect(confirmationOverdue(state(), at('2026-04-01T11:59:59.999Z'))).toBe(false);
    expect(confirmationOverdue(state(), at('2026-04-01T12:00:00.000Z'))).toBe(true);
    const confirmed = state({ confirmedAt: at('2026-03-01T12:00:00.000Z') });
    expect(confirmationOverdue(confirmed, at('2026-04-01T12:00:00.000Z'))).toBe(false);
    expect(confirmationOverdue(confirmed, at('2026-05-30T12:00:00.000Z'))).toBe(true);
  });

  it('sin contraseña no hay nada que confirmar', () => {
    expect(confirmationOverdue(state({ setAt: null }), at('2030-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('aplazada, no se pide hasta que pasa el día; la alerta sigue (vencida)', () => {
    const s = state({ postpones: 1, postponedUntil: at('2026-04-02T12:00:00.000Z') });
    expect(confirmationDue(s, at('2026-04-02T11:59:00.000Z'))).toBe(false);
    expect(confirmationOverdue(s, at('2026-04-02T11:59:00.000Z'))).toBe(true);
    expect(confirmationDue(s, at('2026-04-02T12:00:00.000Z'))).toBe(true);
  });

  it('quedan aplazamientos hasta 3', () => {
    expect([0, 1, 2, 3, 4].map((n) => postponesLeft(state({ postpones: n })))).toEqual([3, 2, 1, 0, 0]);
  });
});
