// T051 · RF-EMP-01 a 06: datos de la empresa (todos los leen; solo una Apoderada los cambia), firma oficial y cuño oficial
// (solo Apoderadas). Cada reemplazo es una fila nueva: los PDF ya emitidos conservan la firma y el cuño que llevaban.
import { Body, Controller, Get, Inject, Patch, Put, Req, Res } from '@nestjs/common';
import { imageInfo, type Clock } from '@impocaribe/shared';
import {
  companyDtoSchema,
  decodeBase64,
  editCompanySchema,
  officialStatusSchema,
  signatureResponseSchema,
  signatureSchema,
  signatureVersionSchema,
  stampResponseSchema,
  stampSchema,
} from '@impocaribe/shared/validation';
import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'express';
import { z } from 'zod';
import type { Tx } from '../audit/audit-log.ts';
import { ALL_ROLES } from '../auth/auth.controller.ts';
import type { AuthedRequest } from '../auth/session.guard.ts';
import { officialSignatures, officialStamps, systemSettings } from '../db/schema/company.ts';
import { users } from '../db/schema/users.ts';
import { updateVersioned } from '../db/versioned.ts';
import { readStoredFile, storeFile } from '../files/files.ts';
import { auditedWrite } from '../http/audited-write.ts';
import { Contract } from '../http/contract.ts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.ts';
import { CLOCK, DATA_DIR, DB } from '../tokens.ts';

const A = ['apoderada'] as const;
const companyColumns = {
  legalName: systemSettings.legalName,
  address: systemSettings.address,
  rowVersion: systemSettings.rowVersion,
};
const signatureColumns = {
  id: officialSignatures.id,
  createdAt: officialSignatures.createdAt,
  createdBy: users.fullName,
  representativeName: officialSignatures.representativeName,
  credentialNo: officialSignatures.credentialNo,
  position: officialSignatures.position,
  fileId: officialSignatures.fileId,
};
const stampColumns = {
  id: officialStamps.id,
  createdAt: officialStamps.createdAt,
  createdBy: users.fullName,
  fileId: officialStamps.fileId,
};

type Version = { id: string; createdAt: Date; createdBy: string; fileId: string };
/** Sin el archivo y con la fecha en ISO, como la ve la interfaz. */
function visible<T extends Version>(version: T) {
  const rest = Object.fromEntries(Object.entries(version).filter(([k]) => k !== 'fileId' && k !== 'createdAt')) as Omit<
    T,
    'fileId' | 'createdAt'
  >;
  return { ...rest, createdAt: version.createdAt.toISOString() };
}

@Controller('company')
export class CompanyController {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DATA_DIR) private readonly dataDir: string,
  ) {}

  @Get()
  @Contract({ output: companyDtoSchema, roles: ALL_ROLES })
  async get(): Promise<z.infer<typeof companyDtoSchema>> {
    const [company] = await this.db.select(companyColumns).from(systemSettings);
    return company!;
  }

  @Patch()
  @Contract({ input: editCompanySchema, output: companyDtoSchema, errors: ['STALE_RECORD'], roles: A })
  async edit(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(editCompanySchema)) input: z.output<typeof editCompanySchema>,
  ): Promise<void> {
    const { expectedVersion, ...values } = input;
    const result = await auditedWrite(this.db, this.clock, req, this.entry(req, 'company.edit'), async (tx) => {
      const [before] = await tx
        .select({ legalName: systemSettings.legalName, address: systemSettings.address })
        .from(systemSettings)
        .for('update');
      const row = await updateVersioned(tx, systemSettings, 1, expectedVersion, {
        ...values,
        updatedAt: this.clock.now(),
      });
      const body = { legalName: row.legalName, address: row.address, rowVersion: row.rowVersion };
      return { status: 200, body, before, after: values };
    });
    res.status(result.status).json(result.body);
  }

  @Get('signature')
  @Contract({ output: signatureResponseSchema, roles: A })
  async signature(): Promise<z.infer<typeof signatureResponseSchema>> {
    const history = await this.db
      .select(signatureColumns)
      .from(officialSignatures)
      .innerJoin(users, eq(users.id, officialSignatures.createdBy))
      .orderBy(desc(officialSignatures.createdAt), desc(officialSignatures.id));
    const [settings] = await this.db.select({ id: systemSettings.currentSignatureId }).from(systemSettings);
    const current = history.find((h) => h.id === settings!.id);
    return { current: current ? await this.withImage(current) : null, history: history.map(visible) };
  }

  @Put('signature')
  @Contract({ input: signatureSchema, output: signatureVersionSchema, roles: A })
  async replaceSignature(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(signatureSchema)) input: z.output<typeof signatureSchema>,
  ): Promise<void> {
    const { image, ...data } = input;
    const result = await auditedWrite(
      this.db,
      this.clock,
      req,
      this.entry(req, 'company.signature.replace'),
      async (tx) => {
        const before = await this.currentSignature(tx);
        const fileId = await this.store(tx, image);
        const [row] = await tx
          .insert(officialSignatures)
          .values({ fileId, ...data, createdBy: req.auth.userId, createdAt: this.clock.now() })
          .returning({ id: officialSignatures.id, createdAt: officialSignatures.createdAt });
        await tx.update(systemSettings).set({ currentSignatureId: row!.id });
        const body = {
          id: row!.id,
          createdAt: row!.createdAt.toISOString(),
          createdBy: await this.name(tx, req),
          ...data,
        };
        return { status: 200, body, entityId: row!.id, before, after: { id: row!.id, ...data } };
      },
    );
    res.status(result.status).json(result.body);
  }

  @Get('stamp')
  @Contract({ output: stampResponseSchema, roles: A })
  async stamp(): Promise<z.infer<typeof stampResponseSchema>> {
    const history = await this.db
      .select(stampColumns)
      .from(officialStamps)
      .innerJoin(users, eq(users.id, officialStamps.createdBy))
      .orderBy(desc(officialStamps.createdAt), desc(officialStamps.id));
    const [settings] = await this.db.select({ id: systemSettings.currentStampId }).from(systemSettings);
    const current = history.find((h) => h.id === settings!.id);
    return { current: current ? await this.withImage(current) : null, history: history.map(visible) };
  }

  @Put('stamp')
  @Contract({ input: stampSchema, output: stampResponseSchema.shape.history.element, roles: A })
  async replaceStamp(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Body(new ZodValidationPipe(stampSchema)) input: z.output<typeof stampSchema>,
  ): Promise<void> {
    const result = await auditedWrite(
      this.db,
      this.clock,
      req,
      this.entry(req, 'company.stamp.replace'),
      async (tx) => {
        const [settings] = await tx.select({ id: systemSettings.currentStampId }).from(systemSettings).for('update');
        const fileId = await this.store(tx, input.image);
        const [row] = await tx
          .insert(officialStamps)
          .values({ fileId, createdBy: req.auth.userId, createdAt: this.clock.now() })
          .returning({ id: officialStamps.id, createdAt: officialStamps.createdAt });
        await tx.update(systemSettings).set({ currentStampId: row!.id });
        const body = { id: row!.id, createdAt: row!.createdAt.toISOString(), createdBy: await this.name(tx, req) };
        const before = settings!.id ? { id: settings!.id } : null;
        return { status: 200, body, entityId: row!.id, before, after: { id: row!.id } };
      },
    );
    res.status(result.status).json(result.body);
  }

  @Get('official-status')
  @Contract({ output: officialStatusSchema, roles: ['apoderada', 'operador'] })
  async officialStatus(): Promise<z.infer<typeof officialStatusSchema>> {
    const [s] = await this.db
      .select({ signature: systemSettings.currentSignatureId, stamp: systemSettings.currentStampId })
      .from(systemSettings);
    return { signature: s!.signature !== null, stamp: s!.stamp !== null };
  }

  /** La firma vigente para la bitácora (sin la imagen), con la fila de configuración bloqueada hasta confirmar. */
  private async currentSignature(tx: Tx) {
    const [settings] = await tx.select({ id: systemSettings.currentSignatureId }).from(systemSettings).for('update');
    if (!settings!.id) return null;
    const [sig] = await tx
      .select({
        id: officialSignatures.id,
        representativeName: officialSignatures.representativeName,
        credentialNo: officialSignatures.credentialNo,
        position: officialSignatures.position,
      })
      .from(officialSignatures)
      .where(eq(officialSignatures.id, settings!.id));
    return sig ?? null;
  }

  /** El esquema ya comprobó que es un PNG o un JPG válido: el tipo sale de su cabecera, no de quien lo sube. */
  private store(tx: Tx, image: string) {
    const bytes = decodeBase64(image)!;
    return storeFile(tx, this.clock, this.dataDir, bytes, imageInfo(bytes)!.mime);
  }

  private async withImage<T extends Version>(version: T) {
    const file = await readStoredFile(this.db, this.dataDir, version.fileId);
    return { ...visible(version), mime: file.mime as 'image/png' | 'image/jpeg', image: file.bytes.toString('base64') };
  }

  private async name(tx: Tx, req: AuthedRequest): Promise<string> {
    const [user] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, req.auth.userId));
    return user!.fullName;
  }

  private entry(req: AuthedRequest, action: string) {
    const { sessionId, userId, deviceId } = req.auth;
    return { userId, sessionId, deviceId, action, entityType: 'company' };
  }
}
