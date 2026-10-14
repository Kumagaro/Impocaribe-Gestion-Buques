// DT-24 · plan §9: el primer arranque y /local/* solo se aceptan desde la propia PC servidor. Se mira la dirección real
// de la conexión, nunca una cabecera (que cualquiera podría escribir).
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { AppError } from '@impocaribe/shared';
import type { Request } from 'express';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLoopback(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK.has(address);
}

export function localOnlyGuard(message: string) {
  @Injectable()
  class LocalOnlyGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<Request>();
      if (!isLoopback(req.socket.remoteAddress)) throw new AppError('FORBIDDEN', message);
      return true;
    }
  }
  return LocalOnlyGuard;
}
