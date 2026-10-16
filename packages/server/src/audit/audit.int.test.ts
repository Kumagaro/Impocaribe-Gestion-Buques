import { AppError, ManualClock } from '@impocaribe/shared';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSuiteDb, type SuiteDb } from '../../test/suite-db.ts';
import { auditedTransaction, recordAudit } from './audit-log.ts';

// T013 · RF-BIT-01, RF-BIT-02, D10 (la bitácora nunca pierde ni modifica un registro) y plan §4.2 (ok = false en rechazos).
let suite: SuiteDb;
let db: NodePgDatabase;
const clock = new ManualClock('2026-10-14T12:00:00.000Z');
const USER = '0192a3b4-0000-7000-8000-000000000001';
const SESSION = '0192a3b4-0000-7000-8000-000000000002';

async function rows() {
  const { rows } = await suite.admin.query(
    `SELECT at, user_id, session_id, device_id, action, entity_type, entity_id, before, after, reason, ok
       FROM audit_log ORDER BY id`,
  );
  return rows.map((r) => ({ ...r, at: (r.at as Date).toISOString() }));
}

beforeAll(async () => {
  suite = await createSuiteDb();
  db = drizzle(suite.app);
}, 60_000);

afterAll(async () => {
  await suite.drop();
});

beforeEach(async () => {
  // Preparación del escenario con el dueño del esquema: la app no puede vaciar la bitácora.
  await suite.admin.query(
    'ALTER TABLE audit_log DISABLE TRIGGER USER; TRUNCATE audit_log; ALTER TABLE audit_log ENABLE TRIGGER USER',
  );
});

describe('RF-BIT-02: cada registro guarda fecha, usuario, dispositivo, acción, entidad y detalle', () => {
  it('registra todos los campos con la hora del reloj del servidor', async () => {
    await recordAudit(db, clock, {
      userId: USER,
      sessionId: SESSION,
      deviceId: 'tablet-patio-1',
      action: 'declaration.edit',
      entityType: 'declaration',
      entityId: '00431',
      before: { total: '100.000' },
      after: { total: '120.000' },
      reason: 'Corrección del total declarado en aduana',
    });
    expect(await rows()).toEqual([
      {
        at: '2026-10-14T12:00:00.000Z',
        user_id: USER,
        session_id: SESSION,
        device_id: 'tablet-patio-1',
        action: 'declaration.edit',
        entity_type: 'declaration',
        entity_id: '00431',
        before: { total: '100.000' },
        after: { total: '120.000' },
        reason: 'Corrección del total declarado en aduana',
        ok: true,
      },
    ]);
  });

  it('un registro dentro de una transacción revertida desaparece con ella (atómico con el cambio)', async () => {
    await expect(
      db.transaction(async (tx) => {
        await recordAudit(tx, clock, { action: 'vessel.create', entityType: 'vessel', entityId: 'EAGLE1' });
        throw new Error('fallo a mitad de la operación');
      }),
    ).rejects.toThrow('fallo a mitad de la operación');
    expect(await rows()).toEqual([]);
  });
});

describe('plan §4.2: las validaciones bloqueadas quedan con ok = false', () => {
  it('un intento rechazado revierte sus cambios y deja un registro ok = false con el código y el mensaje', async () => {
    const rejection = new AppError(
      'OVERDRAFT_ALLOCATION',
      'Sobregiro: la orden supera el saldo por 7,280 t. Quedan 10,000 t en el DM 00431 (buque EAGLE1).',
    );
    await expect(
      auditedTransaction(
        db,
        clock,
        { userId: USER, deviceId: 'pc-oficina', action: 'order.issue', entityType: 'declaration', entityId: '00431' },
        async (tx) => {
          await recordAudit(tx, clock, { action: 'efecto.parcial' }); // un cambio hecho antes del rechazo
          throw rejection;
        },
      ),
    ).rejects.toBe(rejection);
    expect(await rows()).toEqual([
      {
        at: '2026-10-14T12:00:00.000Z',
        user_id: USER,
        session_id: null,
        device_id: 'pc-oficina',
        action: 'order.issue',
        entity_type: 'declaration',
        entity_id: '00431',
        before: null,
        after: {
          code: 'OVERDRAFT_ALLOCATION',
          message: 'Sobregiro: la orden supera el saldo por 7,280 t. Quedan 10,000 t en el DM 00431 (buque EAGLE1).',
        },
        reason: null,
        ok: false,
      },
    ]);
  });

  it('una operación aceptada queda con ok = true y su resultado', async () => {
    const result = await auditedTransaction(db, clock, { action: 'vessel.create', entityType: 'vessel' }, async () => ({
      entityId: 'EAGLE1',
      after: { name: 'EAGLE 1' },
      value: 'creado',
    }));
    expect(result).toBe('creado');
    expect((await rows()).map((r) => [r.action, r.entity_id, r.after, r.ok])).toEqual([
      ['vessel.create', 'EAGLE1', { name: 'EAGLE 1' }, true],
    ]);
  });

  it('un fallo inesperado no se registra como validación bloqueada', async () => {
    await expect(
      auditedTransaction(db, clock, { action: 'vessel.create' }, async () => {
        throw new Error('se cayó la conexión');
      }),
    ).rejects.toThrow('se cayó la conexión');
    expect(await rows()).toEqual([]);
  });
});

describe('D10 y RF-BIT-03: la bitácora no se puede editar ni borrar', () => {
  beforeEach(async () => {
    await recordAudit(db, clock, { action: 'session.login', userId: USER });
  });

  it('la app no tiene permiso de UPDATE (SQLSTATE 42501)', async () => {
    await expect(suite.app.query("UPDATE audit_log SET action = 'otra'")).rejects.toMatchObject({ code: '42501' });
  });

  it('la app no tiene permiso de DELETE (SQLSTATE 42501)', async () => {
    await expect(suite.app.query('DELETE FROM audit_log')).rejects.toMatchObject({ code: '42501' });
  });

  it('la app no puede vaciar la bitácora con TRUNCATE (SQLSTATE 42501)', async () => {
    await expect(suite.app.query('TRUNCATE audit_log')).rejects.toMatchObject({ code: '42501' });
  });

  it('ni siquiera el dueño de la base puede vaciarla con TRUNCATE: lo impide el trigger', async () => {
    await expect(suite.admin.query('TRUNCATE audit_log')).rejects.toThrow(
      'La tabla audit_log es de solo inserción: sus registros no se modifican ni se borran (Const. art. IV).',
    );
  });

  it('ni siquiera el dueño de la base puede hacer UPDATE: lo impide el trigger', async () => {
    await expect(suite.admin.query("UPDATE audit_log SET action = 'otra'")).rejects.toThrow(
      'La tabla audit_log es de solo inserción: sus registros no se modifican ni se borran (Const. art. IV).',
    );
  });

  it('ni siquiera el dueño de la base puede hacer DELETE: lo impide el trigger', async () => {
    await expect(suite.admin.query('DELETE FROM audit_log')).rejects.toThrow(
      'La tabla audit_log es de solo inserción: sus registros no se modifican ni se borran (Const. art. IV).',
    );
  });

  it('el registro sigue intacto', async () => {
    expect((await rows()).map((r) => [r.action, r.user_id, r.ok])).toEqual([['session.login', USER, true]]);
  });
});
