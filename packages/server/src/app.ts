import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppError, isBelowMinVersion } from '@impocaribe/shared';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.ts';
import { HttpErrorFilter } from './http/http-error.filter.ts';
import { MIN_APP_VERSION } from './tokens.ts';

// Orígenes de las apps: Electron (app://), y el WebView de Capacitor (plan §6).
const APP_ORIGINS = ['app://impocaribe', 'https://localhost', 'capacitor://localhost'];
// Rutas que una app desactualizada debe poder usar: estado, descubrimiento y descarga de la actualización (DT-11).
const VERSION_EXEMPT = /^\/api\/v1\/(health|discovery|updates)(\/|$)/;
const API = /^\/api\/v1(\/|$)/;
const WRITES = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api/v1');
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );
  app.enableCors({ origin: APP_ORIGINS });
  const minVersion = app.get<string>(MIN_APP_VERSION);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS' || !API.test(req.path) || VERSION_EXEMPT.test(req.path)) return next();
    const version = req.header('x-app-version') ?? '';
    if (!isBelowMinVersion(version, minVersion)) return next();
    const message = version
      ? `Esta versión de la app (${version}) ya no es compatible. Actualícela a la ${minVersion} o superior.`
      : `La app no indicó su versión. Actualícela a la ${minVersion} o superior.`;
    const error = new AppError('UPGRADE_REQUIRED', message, { appVersion: version, minVersion });
    res.status(error.status).json(error.toBody());
  });
  // DT-22: toda escritura lleva Idempotency-Key, un UUID por cada intento del usuario.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!WRITES.has(req.method) || !API.test(req.path) || UUID.test(req.header('idempotency-key') ?? '')) return next();
    const error = new AppError(
      'VALIDATION_ERROR',
      'Falta la cabecera Idempotency-Key: cada intento del usuario debe llevar un UUID propio.',
    );
    res.status(error.status).json(error.toBody());
  });
  app.useGlobalFilters(new HttpErrorFilter());
  return app;
}

/** Con `httpsOptions` sirve HTTPS con la identidad del servidor (T033, DT-18). */
export async function createApp(httpsOptions?: { key: string; cert: string }) {
  // rawBody: la firma del dispositivo (DT-24) y la idempotencia (DT-22) usan el cuerpo tal como llegó.
  return configureApp(
    await NestFactory.create(AppModule, {
      logger: ['error', 'warn'],
      rawBody: true,
      ...(httpsOptions ? { httpsOptions } : {}),
    }),
  );
}
