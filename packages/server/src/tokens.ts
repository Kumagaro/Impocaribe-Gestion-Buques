// Proveedores inyectables del servidor (se sustituyen en las pruebas).
export const CLOCK = Symbol('CLOCK');
export const MIN_APP_VERSION = Symbol('MIN_APP_VERSION');
export const DB = Symbol('DB');
export const DEVICE_GUARD_ENABLED = Symbol('DEVICE_GUARD_ENABLED');
export const DEVICE_REGISTRY = Symbol('DEVICE_REGISTRY');
export const SERVER_INFO = Symbol('SERVER_INFO');
/** Carpeta de datos del servidor: archivos de firma, cuño y PDF (T050). */
export const DATA_DIR = Symbol('DATA_DIR');
/** T094: la pasada de alertas de condición en segundo plano (las pruebas la llaman directamente). */
export const ALERT_CONDITIONS_ENABLED = Symbol('ALERT_CONDITIONS_ENABLED');
/** T106: conexión con el rol dueño de la base, solo para respaldar y restaurar (decisión del responsable). */
export const MAINTENANCE_DB_URL = Symbol('MAINTENANCE_DB_URL');
/** Carpeta de pg_dump y pg_restore (IMPOCARIBE_PG_BIN); vacía, los del PATH. */
export const PG_BIN = Symbol('PG_BIN');
/** T106: el programador de respaldos (las pruebas lo apagan y llaman a runBackup). */
export const BACKUPS_ENABLED = Symbol('BACKUPS_ENABLED');
/** T132: de dónde se lee la energía (las pruebas ponen uno simulado). */
export const POWER_PROVIDER = Symbol('POWER_PROVIDER');
/** T132: la consulta cada 30 s (las pruebas la apagan y llaman a Power.check). */
export const POWER_ENABLED = Symbol('POWER_ENABLED');
/** T132: cómo se detiene el servidor al 5 % (RF-ENE-04). */
export const POWER_SHUTDOWN = Symbol('POWER_SHUTDOWN');
/** T128: cómo se mide la memoria de PostgreSQL y de Chromium para P-29 (las pruebas ponen una simulada). */
export const MEMORY_PROBE = Symbol('MEMORY_PROBE');
