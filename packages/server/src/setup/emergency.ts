// T126 · RF-INS-11: el restablecimiento de emergencia, para cuando ninguna Apoderada puede entrar ni recuperar su
// contraseña. Lo hace el Administrador de instalación en la PC servidor (permiso de Windows y el código de instalación
// que guarda el servidor): pone una contraseña temporal que la Apoderada deberá cambiar al entrar, cierra sus
// sesiones, queda en la bitácora y avisa a las Apoderadas (AL-11). Un código incorrecto se rechaza y también queda.
import { AppError, type Clock } from '@impocaribe/shared';
import { passwordSchema } from '@impocaribe/shared/validation';
import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { raiseEvent } from '../alerts/alerts.ts';
import { recordAudit, recordRejected } from '../audit/audit-log.ts';
import { hashSecret, verifySecret } from '../auth/password.ts';
import { revokeUserSessions } from '../auth/sessions.ts';
import { systemSettings } from '../db/schema/company.ts';
import { users } from '../db/schema/users.ts';
import { recordUserChange, userColumns } from '../users/users.repo.ts';

export interface EmergencyReset {
  code: string;
  username: string;
  password: string;
}

export async function emergencyReset(db: NodePgDatabase, clock: Clock, input: EmergencyReset): Promise<void> {
  const password = passwordSchema.safeParse(input.password);
  if (!password.success) throw new AppError('VALIDATION_ERROR', password.error.issues[0]!.message);
  // Rechazar fuera de la transacción del cambio: el rechazo queda en la bitácora aunque no se cambie nada.
  const rejected = await db.transaction(async (tx) => {
    const entry = { action: 'auth.emergency_reset', entityType: 'user' } as const;
    const [settings] = await tx.select({ hash: systemSettings.installationCodeHash }).from(systemSettings);
    const [user] = await tx.select().from(users).where(eq(users.username, input.username)).for('update');
    const target = user ? { userId: user.id, entityId: user.id } : {};
    if (!settings?.hash || !(await verifySecret(settings.hash, input.code.trim().toUpperCase()))) {
      const error = new AppError('INSTALL_CODE_INVALID', 'El código de instalación no es correcto.');
      await recordRejected(tx, clock, { ...entry, ...target }, error);
      return error;
    }
    if (!user || user.role !== 'apoderada' || !user.active) {
      const error = new AppError('NOT_FOUND', `No hay una Apoderada activa con el usuario «${input.username}».`);
      await recordRejected(tx, clock, { ...entry, ...target }, error);
      return error;
    }
    const [dto] = await tx
      .update(users)
      .set({
        passwordHash: await hashSecret(password.data),
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
        rowVersion: sql`${users.rowVersion} + 1`,
        updatedAt: clock.now(),
      })
      .where(eq(users.id, user.id))
      .returning(userColumns);
    const closed = await revokeUserSessions(tx, clock, user.id);
    await recordUserChange(tx, clock, dto!);
    await recordAudit(tx, clock, { ...entry, ...target, after: { closedSessions: closed.length } });
    await raiseEvent(tx, clock, {
      type: 'AL-11',
      title: `Restablecimiento de emergencia de la contraseña de ${user.fullName}`,
      detail:
        'Lo hizo el Administrador de instalación en la PC servidor. Deberá cambiarla al entrar; se cerraron sus sesiones.',
      entity: { type: 'user', id: user.id },
    });
    return null;
  });
  if (rejected) throw rejected;
}
