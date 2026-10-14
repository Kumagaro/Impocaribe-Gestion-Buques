import { describe, expect, it } from 'vitest';
import { ACTIONS, can, ROLES, type Action, type Role } from './permissions.ts';

// T009 · spec §2 "Actores y permisos": la matriz, celda por celda, tal como está en la tabla de la spec.
// Columnas: Apoderada, Operador, Solo lectura.
const SPEC_MATRIX: Record<Action, [boolean, boolean, boolean]> = {
  view: [true, true, true], // Ver tablero, buques, DM, órdenes, PDF, bitácora y alertas
  'drafts.viewShared': [true, true, false], // Ver borradores compartidos
  'records.edit': [true, true, false], // Crear y editar buques, DM y asignaciones
  'catalogs.toggle': [true, true, false], // Activar y desactivar clientes, destinatarios, transportistas, camiones, remolques y choferes
  'drafts.edit': [true, true, false], // Crear y editar borradores
  'orders.issue': [true, true, false], // Oficializar, corregir (nueva versión) y anular
  'overrides.decide': [true, true, false], // Tomar decisiones de excepción
  'declarations.reactivate': [true, true, false], // Reactivar una DM vencida
  'users.manage': [true, false, false], // Crear, editar y desactivar usuarios
  'company.officialMarks': [true, false, false], // Cargar y cambiar la firma oficial y el cuño oficial
  'backups.manage': [true, false, false], // Hacer respaldo manual y restaurar
  'drafts.forceUnlock': [true, false, false], // Liberar el bloqueo de un borrador que tiene otra persona
  'vessels.close': [true, true, false], // Cerrar un buque y dar destino a su sobrante
  'settings.manage': [true, false, false], // Cambiar la configuración del sistema
  'restore.recoverOrders': [true, false, false], // Recuperar órdenes perdidas tras una restauración
  'devices.revoke': [true, false, false], // Revocar dispositivos emparejados
  'installationCode.change': [true, false, false], // Cambiar el código de instalación
};

const COLUMNS: Role[] = ['apoderada', 'operador', 'lectura'];

describe('spec §2: matriz de permisos', () => {
  it('tiene los tres roles del sistema', () => {
    expect(ROLES).toEqual(['apoderada', 'operador', 'lectura']);
  });

  it('cubre exactamente las 17 acciones de la tabla', () => {
    expect([...ACTIONS].sort()).toEqual(Object.keys(SPEC_MATRIX).sort());
  });

  const cells = Object.entries(SPEC_MATRIX).flatMap(([action, row]) =>
    COLUMNS.map((role, i) => [role, action as Action, row[i]!] as const),
  );
  it.each(cells)('%s · %s → %s', (role, action, allowed) => {
    expect(can(role, action)).toBe(allowed);
  });

  it('Solo lectura no ve ni edita borradores', () => {
    expect([can('lectura', 'drafts.viewShared'), can('lectura', 'drafts.edit')]).toEqual([false, false]);
  });
});
