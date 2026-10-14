import { Controller, Get, Inject } from '@nestjs/common';
import type { Clock } from '@impocaribe/shared';
import { CLOCK } from './tokens.ts';

@Controller('health')
export class HealthController {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  @Get()
  health() {
    return { status: 'ok', serverTime: this.clock.now().toISOString() };
  }
}
