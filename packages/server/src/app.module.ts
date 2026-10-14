import { Module } from '@nestjs/common';
import { systemClock } from '@impocaribe/shared';
import { config } from './config.ts';
import { HealthController } from './health.controller.ts';
import { CLOCK, MIN_APP_VERSION } from './tokens.ts';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: MIN_APP_VERSION, useFactory: () => config().minAppVersion },
  ],
})
export class AppModule {}
