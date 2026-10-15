// Eventos internos del servidor que el WebSocket (T043, plan §6.4) reenvía a las apps: device.revoked, session.revoked…
import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export interface ServerEventMap {
  'device.revoked': [{ deviceId: string }];
}

@Injectable()
export class ServerEvents extends EventEmitter<ServerEventMap> {}
