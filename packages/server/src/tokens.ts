// Proveedores inyectables del servidor (se sustituyen en las pruebas).
export const CLOCK = Symbol('CLOCK');
export const MIN_APP_VERSION = Symbol('MIN_APP_VERSION');
export const DB = Symbol('DB');
export const DEVICE_GUARD_ENABLED = Symbol('DEVICE_GUARD_ENABLED');
export const DEVICE_REGISTRY = Symbol('DEVICE_REGISTRY');
export const SERVER_INFO = Symbol('SERVER_INFO');
/** Carpeta de datos del servidor: archivos de firma, cuño y PDF (T050). */
export const DATA_DIR = Symbol('DATA_DIR');
