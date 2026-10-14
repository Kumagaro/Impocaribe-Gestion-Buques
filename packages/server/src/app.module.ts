import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { systemClock } from '@impocaribe/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from './config.ts';
import { createAppPool } from './db/db.ts';
import { HealthController } from './health.controller.ts';
import { DeviceGuard } from './http/device.guard.ts';
import { CLOCK, DB, DEVICE_GUARD_ENABLED, DEVICE_REGISTRY, MIN_APP_VERSION } from './tokens.ts';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: MIN_APP_VERSION, useFactory: () => config().minAppVersion },
    { provide: DB, useFactory: () => drizzle(createAppPool(config().databaseUrl)) },
    // DT-24: la guarda se activa con el emparejamiento (T035), que también aporta el registro de dispositivos.
    { provide: DEVICE_GUARD_ENABLED, useValue: false },
    { provide: DEVICE_REGISTRY, useValue: { find: async () => null } },
    { provide: APP_GUARD, useClass: DeviceGuard },
  ],
  exports: [CLOCK, DB],
})
export class AppModule {}
