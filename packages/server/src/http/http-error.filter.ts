import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { AppError } from '@impocaribe/shared';
import type { Response } from 'express';

/** Toda respuesta de error sigue el formato del plan §6.1, con código estable y mensaje en español. */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const error = this.toAppError(exception);
    host.switchToHttp().getResponse<Response>().status(error.status).json(error.toBody());
  }

  private toAppError(exception: unknown): AppError {
    if (exception instanceof AppError) return exception;
    // El lector de JSON (body-parser) rechaza los cuerpos que pasan del límite: 100 kB, salvo firma y cuño (app.ts).
    if ((exception as { type?: string } | null)?.type === 'entity.too.large')
      return new AppError('VALIDATION_ERROR', 'La petición es demasiado grande para el servidor.');
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404) return new AppError('NOT_FOUND', 'La ruta solicitada no existe.');
      if (status >= 400 && status < 500) return new AppError('VALIDATION_ERROR', 'La petición no es válida.');
    }
    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    return new AppError(
      'INTERNAL_ERROR',
      'Error interno del servidor. Inténtelo de nuevo; si se repite, avise al responsable.',
    );
  }
}
