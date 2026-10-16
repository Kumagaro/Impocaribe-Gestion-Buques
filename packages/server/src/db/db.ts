import pg from 'pg';

export const APP_ROLE = 'impocaribe_app';

/**
 * Pool de la aplicación: cada conexión trabaja con el rol `impocaribe_app`, que no tiene UPDATE ni DELETE sobre las tablas
 * de solo inserción ni puede cambiar el esquema (plan §9). El rol se fija al abrir la conexión. Máximo 10 (plan §10.7).
 */
export function createAppPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10, options: `-c role=${APP_ROLE}` });
}
