// T029 · Const. art. X.5 y plan §6: cada petición se autoriza en el servidor según el contrato de su ruta. Las rutas
// públicas lo declaran; las demás exigen una sesión vigente (absoluta, RF-AUT-02) de un usuario activo con un rol
// permitido. Una ruta sin contrato no se sirve a nadie.
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError, type Clock, type Role } from '@impocaribe/shared';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Request } from 'express';
import { sessions, users } from '../db/schema/users.ts';
import { CONTRACT, type RouteContract } from '../http/contract.ts';
import type { DeviceRequest } from '../http/device.guard.ts';
import { CLOCK, DB } from '../tokens.ts';
import { hashToken } from './sessions.ts';

export interface AuthContext {
  sessionId: string;
  userId: string;
  role: Role;
  deviceId: string;
}

export type AuthedRequest = Request & { auth: AuthContext };

/** last_seen_at se actualiza como mucho una vez por minuto: no hace falta escribir en cada petición. */
const SEEN_EVERY_MS = 60_000;
const expired = () => new AppError('SESSION_EXPIRED', 'La sesión venció. Inicie sesión de nuevo.');

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const contract = this.reflector.get<RouteContract | undefined>(CONTRACT, context.getHandler());
    if (contract?.roles === 'public') return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.header('authorization') ?? '';
    if (!header.startsWith('Bearer ')) throw expired();
    const now = this.clock.now();
    const [row] = await this.db
      .select({
        sessionId: sessions.id,
        userId: users.id,
        role: users.role,
        deviceId: sessions.deviceId,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
        lastSeenAt: sessions.lastSeenAt,
        active: users.active,
        mustChangePassword: users.mustChangePassword,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hashToken(header.slice(7))), eq(sessions.kind, 'app')));
    if (!row || row.revokedAt || row.expiresAt <= now || !row.active) throw expired();
    // Plan §9: la sesión solo vale desde el dispositivo que la abrió, con su secreto (DT-24).
    const device = (req as DeviceRequest).device;
    if (device && device.id !== row.deviceId) throw expired();
    if (now.getTime() - row.lastSeenAt.getTime() >= SEEN_EVERY_MS)
      await this.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.sessionId));
    req.auth = { sessionId: row.sessionId, userId: row.userId, role: row.role, deviceId: row.deviceId };
    if (row.mustChangePassword && !contract?.whileMustChangePassword)
      throw new AppError('FORBIDDEN', 'Debe cambiar su contraseña antes de continuar.');
    if (!contract || !contract.roles.includes(row.role))
      throw new AppError('FORBIDDEN', 'Su rol no permite esta acción.');
    return true;
  }
}
