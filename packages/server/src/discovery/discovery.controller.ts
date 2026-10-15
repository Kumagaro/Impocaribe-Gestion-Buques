// T034 · plan §6.2: GET /discovery, público. Lo usa la búsqueda en la subred y la comprobación de la última dirección.
import { Controller, Get, Inject } from '@nestjs/common';
import { AppError } from '@impocaribe/shared';
import { discoveryResponseSchema } from '@impocaribe/shared/validation';
import type { z } from 'zod';
import { Contract } from '../http/contract.ts';
import { SERVER_INFO } from '../tokens.ts';

export interface ServerInfo {
  serverId: string;
  name: string;
  version: string;
  caFingerprint: string;
}

@Controller('discovery')
export class DiscoveryController {
  constructor(@Inject(SERVER_INFO) private readonly info: ServerInfo | null) {}

  @Get()
  @Contract({ output: discoveryResponseSchema, roles: 'public' })
  discovery(): z.infer<typeof discoveryResponseSchema> {
    if (!this.info)
      throw new AppError('NOT_FOUND', 'Este servidor aún no tiene identidad: créela con el ayudante de instalación.');
    return this.info;
  }
}
