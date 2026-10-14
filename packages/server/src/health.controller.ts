import { Controller, Get, Inject } from '@nestjs/common';
import type { Clock } from '@impocaribe/shared';
import { healthResponseSchema } from '@impocaribe/shared/validation';
import { Contract } from './http/contract.ts';
import { CLOCK } from './tokens.ts';

@Controller('health')
export class HealthController {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  @Get()
  @Contract({ output: healthResponseSchema, roles: 'public' })
  health() {
    return { status: 'ok', serverTime: this.clock.now().toISOString() };
  }
}
