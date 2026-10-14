import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { systemClock } from '@impocaribe/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from './config.ts';
import { createAppPool } from './db/db.ts';
import { AuthController } from './auth/auth.controller.ts';
import { SessionGuard } from './auth/session.guard.ts';
import { HealthController } from './health.controller.ts';
import { SetupController } from './users/setup.controller.ts';
import { DeviceGuard } from './http/device.guard.ts';
import { CLOCK, DB, DEVICE_GUARD_ENABLED, DEVICE_REGISTRY, MIN_APP_VERSION } from './tokens.ts';

@Module({
  controllers: [HealthController, SetupController, AuthController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: MIN_APP_VERSION, useFactory: () => config().minAppVersion },
    { provide: DB, useFactory: () => drizzle(createAppPool(config().databaseUrl)) },
    // DT-24: la guarda se activa con el emparejamiento (T035), que también aporta el registro de dispositivos.
    { provide: DEVICE_GUARD_ENABLED, useValue: false },
    { provide: DEVICE_REGISTRY, useValue: { find: async () => null } },
    // Primero el dispositivo (DT-24) y después la sesión y el rol de la ruta (Const. art. X.5).
    { provide: APP_GUARD, useClass: DeviceGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [CLOCK, DB],
})
export class AppModule {}
