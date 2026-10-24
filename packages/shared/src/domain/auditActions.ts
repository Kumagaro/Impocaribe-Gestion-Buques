// T104 · RF-BIT-01, 03: las acciones de la bitácora en palabras, y los grupos del filtro «Acción» de P-25.

export const AUDIT_GROUPS = {
  order: 'Órdenes',
  draft: 'Borradores',
  declaration: 'DM y asignaciones',
  vessel: 'Buques',
  catalog: 'Catálogos',
  access: 'Acceso y usuarios',
  company: 'Empresa y configuración',
  alert: 'Alertas',
  system: 'Respaldos y versiones',
} as const;
export type AuditGroup = keyof typeof AUDIT_GROUPS;

/** Prefijos de acción de cada grupo (`order.` cubre `order.issue`, `order.correct`…). */
export const AUDIT_GROUP_PREFIXES: Record<AuditGroup, readonly string[]> = {
  order: ['order.'],
  draft: ['draft.'],
  declaration: ['declaration.', 'allocation.'],
  vessel: ['vessel.'],
  catalog: ['client.', 'carrier.', 'truck.', 'trailer.', 'driver.'],
  access: ['auth.', 'session.', 'user.', 'device.', 'setup.'],
  company: ['company.', 'settings.'],
  alert: ['alert.'],
  system: ['backup.', 'release.'],
};

const LABELS: Record<string, string> = {
  'order.issue': 'Emitir orden',
  'order.correct': 'Corregir orden',
  'order.void': 'Anular orden',
  'order.download': 'Descargar orden',
  'order.recover': 'Recuperar orden perdida',
  'order.lost.discard': 'Descartar orden perdida',
  'draft.save': 'Guardar borrador',
  'draft.sync': 'Subir borradores',
  'draft.edit': 'Editar borrador',
  'draft.share': 'Compartir borrador',
  'draft.lock': 'Abrir borrador compartido',
  'draft.unlock': 'Liberar borrador',
  'draft.heartbeat': 'Seguir editando borrador',
  'draft.discard': 'Descartar borrador',
  'declaration.create': 'Registrar DM',
  'declaration.edit': 'Editar DM',
  'declaration.expire': 'Vencer DM',
  'declaration.reactivate': 'Reactivar DM',
  'allocation.assign': 'Asignar a buque',
  'allocation.edit': 'Cambiar asignación',
  'vessel.create': 'Registrar buque',
  'vessel.edit': 'Editar buque',
  'vessel.arrival': 'Registrar arribo',
  'vessel.close': 'Cerrar buque',
  'vessel.surplus.transfer': 'Transferir sobrante',
  'vessel.surplus.loss': 'Registrar merma',
  'vessel.surplus.allocate': 'Asignar sobrante a DM',
  'driver.carrier': 'Cambiar transportista del chofer',
  'auth.login': 'Iniciar sesión',
  'auth.logout': 'Cerrar sesión',
  'auth.locked': 'Cuenta bloqueada',
  'auth.change_password': 'Cambiar contraseña',
  'auth.recover': 'Recuperar contraseña',
  'auth.recovery_codes': 'Generar códigos de recuperación',
  'auth.device_token': 'Token de alertas del dispositivo',
  'auth.session_closed': 'Cerrar una sesión',
  'auth.sessions_closed': 'Cerrar todas las sesiones',
  'session.login': 'Iniciar sesión',
  'setup.first_apoderada': 'Crear la primera Apoderada',
  'user.create': 'Crear usuario',
  'user.edit': 'Editar usuario',
  'user.activate': 'Activar usuario',
  'user.deactivate': 'Desactivar usuario',
  'user.reset_password': 'Restablecer contraseña',
  'device.pair': 'Emparejar dispositivo',
  'device.pair_rejected': 'Rechazar emparejamiento',
  'device.revoke': 'Revocar dispositivo',
  'company.edit': 'Editar datos de la empresa',
  'company.signature.replace': 'Cambiar la firma oficial',
  'company.stamp.replace': 'Cambiar el cuño oficial',
  'settings.edit': 'Cambiar la configuración',
  'settings.installation_code': 'Cambiar el código de instalación',
  'alert.attend': 'Atender alerta',
  'backup.manual': 'Respaldo manual',
  'backup.password': 'Definir la contraseña de respaldo',
  'backup.password.confirm': 'Confirmar la contraseña de respaldo',
  'backup.password.postpone': 'Aplazar la confirmación de la contraseña de respaldo',
  'backup.restore': 'Restaurar un respaldo',
  'backup.numbering': 'Confirmar la numeración',
  'release.publish': 'Publicar una versión de la app',
  'release.min_supported': 'Marcar la versión mínima',
};

const CATALOG: Record<string, string> = {
  client: 'cliente',
  carrier: 'transportista',
  truck: 'camión',
  trailer: 'remolque',
  driver: 'chofer',
};
const VERB: Record<string, string> = { create: 'Crear', edit: 'Editar', activate: 'Activar', deactivate: 'Desactivar' };

/** «Emitir orden»; los catálogos se arman («Desactivar cliente»); lo desconocido se muestra tal cual. */
export function auditActionLabel(action: string): string {
  if (LABELS[action]) return LABELS[action];
  const [entity, verb] = action.split('.');
  if (entity && verb && CATALOG[entity] && VERB[verb]) return `${VERB[verb]} ${CATALOG[entity]}`;
  return action;
}

/** El grupo de una acción, o null si no pertenece a ninguno. */
export function auditGroupOf(action: string): AuditGroup | null {
  for (const [group, prefixes] of Object.entries(AUDIT_GROUP_PREFIXES) as [AuditGroup, readonly string[]][])
    if (prefixes.some((p) => action.startsWith(p))) return group;
  return null;
}
