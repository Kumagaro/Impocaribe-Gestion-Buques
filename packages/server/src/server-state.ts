// T130 · D14 y plan §4.2: en cada momento hay como mucho un servidor activo con la identidad de la instalación. Tras
// «Preparar traslado», la base de la PC anterior queda `migrated` y su servidor no vuelve a arrancar.
import pg from 'pg';

export const MIGRATED_MESSAGE =
  'Este servidor se trasladó a otra PC (Preparar traslado): no puede volver a arrancar aquí. ' +
  'Los dispositivos trabajan con el servidor nuevo.';

/** El estado guardado en la base; null si la base aún no tiene la columna (antes de migrar). */
export async function readServerState(databaseUrl: string): Promise<'active' | 'migrated' | null> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ state: 'active' | 'migrated' }>(
      'SELECT server_state AS state FROM system_settings',
    );
    return rows[0]?.state ?? null;
  } catch (err) {
    // 42703: la columna no existe todavía (una base anterior a la migración 0017).
    if ((err as { code?: string }).code === '42703') return null;
    throw err;
  } finally {
    await client.end();
  }
}
