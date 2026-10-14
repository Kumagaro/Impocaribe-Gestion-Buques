import type { PipeTransform } from '@nestjs/common';
import { AppError } from '@impocaribe/shared';
import type { ZodType } from 'zod';

/** Valida con un esquema compartido (DT-25) y convierte los fallos en VALIDATION_ERROR con el error de cada campo. */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) fields[issue.path.join('.')] ??= issue.message;
    const n = Object.keys(fields).length;
    throw new AppError('VALIDATION_ERROR', `Hay ${n} ${n === 1 ? 'campo' : 'campos'} por corregir.`, { fields });
  }
}
