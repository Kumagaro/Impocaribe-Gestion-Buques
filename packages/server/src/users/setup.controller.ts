// T028 · RF-USR-05: el primer arranque crea la primera Apoderada, solo desde la PC servidor y una sola vez.
import { Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { AppError, type Clock } from '@impocaribe/shared';
import { setupResponseSchema, setupSchema, setupStatusSchema } from '@impocaribe/shared/validation';
import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { z } from 'zod';
import { auditedTransaction } from '../audit/audit-log.ts';
import { users } from '../db/schema/users.ts';
import { Contract } from '../http/contract.ts';
import { localOnlyGuard } from '../http/local-only.guard.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { recordChanges } from '../sync/change-log.ts';
import { CLOCK, DB } from '../tokens.ts';
import { issueRecoveryCodes } from './recovery-codes.ts';
import { createUser } from './users.repo.ts';

@Controller('setup')
export class SetupController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get('status')
  @Contract({ output: setupStatusSchema, roles: 'public' })
  async status(): Promise<z.infer<typeof setupStatusSchema>> {
    const [row] = await this.db.select({ id: users.id }).from(users).where(eq(users.role, 'apoderada')).limit(1);
    return { configured: row !== undefined };
  }

  @Post()
  @HttpCode(201)
  @UseGuards(localOnlyGuard('El primer arranque solo se hace desde la propia PC servidor.'))
  @Contract({ input: setupSchema, output: setupResponseSchema, roles: 'public' })
  async create(
    @Body(new ZodValidationPipe(setupSchema)) input: z.output<typeof setupSchema>,
  ): Promise<z.infer<typeof setupResponseSchema>> {
    // Sin Idempotency-Key guardada: la respuesta lleva los códigos en claro y no se conservan. Un reintento recibe
    // "ya configurado" y los códigos se regeneran desde el perfil (RF-REC-03).
    return auditedTransaction(
      this.db,
      this.clock,
      { action: 'setup.first_apoderada', entityType: 'user' },
      async (tx) => {
        // Dos primeros arranques a la vez: el segundo espera y ve la Apoderada del primero.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('impocaribe.setup'))`);
        const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.role, 'apoderada')).limit(1);
        if (existing)
          throw new AppError('FORBIDDEN', 'El sistema ya está configurado: la primera Apoderada ya existe.');
        const user = await createUser(tx, this.clock, input);
        const recoveryCodes = await issueRecoveryCodes(tx, this.clock, user.id);
        await recordChanges(tx, this.clock, [
          { entityType: 'user', entityId: user.id, op: 'upsert', audience: 'apoderada', payload: user },
        ]);
        return { value: { user, recoveryCodes }, entityId: user.id, after: user, userId: user.id };
      },
    );
  }
}
