import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { systemClock, type Clock } from '@impocaribe/shared';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { config } from './config.ts';
import { createAppPool } from './db/db.ts';
import { AlertsController } from './alerts/alerts.controller.ts';
import { ArchiveController } from './archive/archive.controller.ts';
import { AuditController } from './audit/audit.controller.ts';
import { BackupPasswordController } from './backups/backup-password.controller.ts';
import { BackupsController } from './backups/backups.controller.ts';
import { BackupScheduler } from './backups/scheduler.ts';
import { AlertConditions } from './alerts/conditions.ts';
import { AuthController } from './auth/auth.controller.ts';
import { RecoveryController } from './auth/recovery.controller.ts';
import { SessionGuard } from './auth/session.guard.ts';
import { DiscoveryController } from './discovery/discovery.controller.ts';
import { readServerInfo } from './discovery/server-info.ts';
import { HealthController } from './health.controller.ts';
import { DeviceGuard } from './http/device.guard.ts';
import { DbDeviceRegistry } from './pairing/device-registry.ts';
import { DevicesController } from './pairing/devices.controller.ts';
import { LocalController } from './pairing/local.controller.ts';
import { PairingController } from './pairing/pairing.controller.ts';
import { SetupController } from './users/setup.controller.ts';
import { UsersController } from './users/users.controller.ts';
import { CompanyController } from './company/company.controller.ts';
import { SettingsController } from './company/settings.controller.ts';
import { CATALOG_CONTROLLERS } from './catalogs/catalogs.controller.ts';
import { AllocationsController, DeclarationsController } from './vessels/declarations.controller.ts';
import { DeclarationExpiry } from './vessels/expiry.ts';
import { VesselsController } from './vessels/vessels.controller.ts';
import { DraftsController } from './orders/drafts.controller.ts';
import { OrdersController } from './orders/orders.controller.ts';
import { PdfService } from './orders/pdf-engine.ts';
import { Realtime } from './sync/realtime.ts';
import { ChangeLogPurge, SyncController } from './sync/sync.controller.ts';
import {
  ALERT_CONDITIONS_ENABLED,
  BACKUPS_ENABLED,
  MAINTENANCE_DB_URL,
  PG_BIN,
  CLOCK,
  DATA_DIR,
  DB,
  DEVICE_GUARD_ENABLED,
  DEVICE_REGISTRY,
  MIN_APP_VERSION,
  SERVER_INFO,
} from './tokens.ts';

@Module({
  controllers: [
    HealthController,
    DiscoveryController,
    PairingController,
    LocalController,
    DevicesController,
    SetupController,
    AuthController,
    RecoveryController,
    UsersController,
    SyncController,
    CompanyController,
    SettingsController,
    ...CATALOG_CONTROLLERS,
    VesselsController,
    DeclarationsController,
    AllocationsController,
    OrdersController,
    DraftsController,
    AlertsController,
    AuditController,
    ArchiveController,
    BackupPasswordController,
    BackupsController,
  ],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: SERVER_INFO, useFactory: () => readServerInfo(config().identityDir) },
    { provide: MIN_APP_VERSION, useFactory: () => config().minAppVersion },
    { provide: DATA_DIR, useFactory: () => config().dataDir },
    { provide: DB, useFactory: () => drizzle(createAppPool(config().databaseUrl)) },
    Realtime,
    ChangeLogPurge,
    DeclarationExpiry,
    { provide: ALERT_CONDITIONS_ENABLED, useValue: true },
    AlertConditions,
    { provide: MAINTENANCE_DB_URL, useFactory: () => config().databaseUrl },
    { provide: PG_BIN, useFactory: () => process.env.IMPOCARIBE_PG_BIN ?? '' },
    { provide: BACKUPS_ENABLED, useValue: true },
    BackupScheduler,
    // T078: una sola instancia de Chromium para todo el servidor, cerrada al apagarlo.
    { provide: PdfService, useFactory: () => new PdfService() },
    // DT-24 y RF-RED-04: todo, salvo descubrir y emparejarse, exige un dispositivo emparejado (T035).
    { provide: DEVICE_GUARD_ENABLED, useValue: true },
    {
      provide: DEVICE_REGISTRY,
      useFactory: (db: NodePgDatabase, clock: Clock) => new DbDeviceRegistry(db, clock),
      inject: [DB, CLOCK],
    },
    // Primero el dispositivo (DT-24) y después la sesión y el rol de la ruta (Const. art. X.5).
    { provide: APP_GUARD, useClass: DeviceGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [CLOCK, DB],
})
export class AppModule {}
