// Matriz de permisos de la spec §2. El servidor la aplica en cada petición (Const. art. X.5);
// la interfaz la usa solo para ocultar lo que el rol no puede hacer (EST-05).
export const ROLES = ['apoderada', 'operador', 'lectura'] as const;
export type Role = (typeof ROLES)[number];

const EDITORS: readonly Role[] = ['apoderada', 'operador'];
const APODERADA: readonly Role[] = ['apoderada'];

const MATRIX = {
  view: ROLES,
  'drafts.viewShared': EDITORS,
  'records.edit': EDITORS,
  'catalogs.toggle': EDITORS,
  'drafts.edit': EDITORS,
  'orders.issue': EDITORS,
  'overrides.decide': EDITORS,
  'declarations.reactivate': EDITORS,
  'users.manage': APODERADA,
  'company.officialMarks': APODERADA,
  'backups.manage': APODERADA,
  'drafts.forceUnlock': APODERADA,
  'vessels.close': EDITORS,
  'settings.manage': APODERADA,
  'restore.recoverOrders': APODERADA,
  'devices.revoke': APODERADA,
  'installationCode.change': APODERADA,
} satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof MATRIX;
export const ACTIONS = Object.keys(MATRIX) as Action[];

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}
