import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { AppError, isClockSkewed, signRequest, type Clock } from '@impocaribe/shared';
import type { Request } from 'express';
import { CLOCK, DEVICE_GUARD_ENABLED, DEVICE_REGISTRY } from '../tokens.ts';

export interface DeviceRecord {
  secret: string;
  revoked: boolean;
  /** Desfase medido en /sync/state: hora del dispositivo − hora del servidor. */
  clockOffsetMs: number;
}

export interface DeviceRegistry {
  find(deviceId: string): Promise<DeviceRecord | null>;
  /** Anota la última conexión del dispositivo (RF-RED-05). */
  seen?(deviceId: string, appVersion?: string): Promise<void>;
}

/** El dispositivo ya verificado de la petición, para la sesión, la bitácora y la idempotencia. */
export type DeviceRequest = Request & { device?: { id: string } };

// Públicas sin dispositivo: estado, descubrimiento y emparejamiento (DT-24). /local/* tampoco lo pide: solo atiende a
// 127.0.0.1 (localOnlyGuard), y es por donde la app de la PC servidor se empareja sola. T113: tampoco la consulta y la
// descarga de versiones, que P-27 usa antes de que la interfaz arranque.
const EXEMPT = /^\/api\/v1\/((health|discovery|pairing|local)(\/|$)|updates\/(check|[^/]+\/[^/]+\/download)$)/;
const WINDOW_MS = 5 * 60_000;
// RF-CON-10: aquí se mide el desfase, así que es la única ruta que se acepta con la hora fuera de la ventana. La firma
// y el rechazo de repeticiones se comprueban igual.
const MEASURES_CLOCK = /^\/api\/v1\/sync\/state(\?|$)/;

const notPaired = () =>
  new AppError(
    'DEVICE_NOT_PAIRED',
    'Este dispositivo no está emparejado con el servidor. Emparéjelo desde la pantalla de conexión.',
  );

/**
 * DT-24: cada petición lleva X-Device-Id, X-Device-Time y la firma HMAC-SHA256 del dispositivo. La hora se compara con la
 * del servidor corregida por el desfase medido (±5 min) y una firma no se acepta dos veces dentro de la ventana.
 * Se activa con el emparejamiento (T035); hasta entonces DEVICE_GUARD_ENABLED es false.
 */
@Injectable()
export class DeviceGuard implements CanActivate {
  private readonly seen = new Map<string, number>();

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DEVICE_GUARD_ENABLED) private readonly enabled: boolean,
    @Inject(DEVICE_REGISTRY) private readonly registry: DeviceRegistry,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    if (!this.enabled || EXEMPT.test(req.path)) return true;
    const deviceId = req.header('x-device-id');
    const time = req.header('x-device-time');
    const signature = req.header('x-device-signature');
    if (!deviceId || !time || !signature) throw notPaired();
    const device = await this.registry.find(deviceId);
    if (!device) throw notPaired();
    if (device.revoked) {
      throw new AppError('DEVICE_REVOKED', 'Este dispositivo fue revocado. Para volver a usarlo, emparéjelo de nuevo.');
    }
    const body = req.rawBody?.toString('utf8') ?? '';
    const expected = await signRequest({ method: req.method, path: req.originalUrl, time, body }, device.secret);
    if (signature !== expected) throw new AppError('DEVICE_NOT_PAIRED', 'La firma del dispositivo no es válida.');
    const now = this.clock.now();
    if (
      !MEASURES_CLOCK.test(req.originalUrl) &&
      isClockSkewed(new Date(parseInt(time, 10) - device.clockOffsetMs), now)
    ) {
      throw new AppError(
        'DEVICE_NOT_PAIRED',
        'La hora del dispositivo difiere más de 5 minutos de la del servidor. Ajústela y vuelva a intentarlo.',
      );
    }
    this.forgetExpired(now.getTime());
    if (this.seen.has(signature)) {
      throw new AppError('DEVICE_NOT_PAIRED', 'Esta petición ya se recibió antes: no se procesa dos veces.');
    }
    this.seen.set(signature, now.getTime() + 2 * WINDOW_MS);
    (req as DeviceRequest).device = { id: deviceId };
    await this.registry.seen?.(deviceId, req.header('x-app-version'));
    return true;
  }

  private forgetExpired(now: number): void {
    for (const [signature, until] of this.seen) if (until <= now) this.seen.delete(signature);
  }
}
