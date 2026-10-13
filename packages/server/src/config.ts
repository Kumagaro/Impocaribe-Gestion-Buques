import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const ENVIRONMENTS = ['development', 'test', 'production'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export interface Config {
  env: Environment;
  port: number;
  databaseUrl: string;
  dataDir: string;
}

type Env = Record<string, string | undefined>;

/** Configuración por entorno a partir de las variables (T004, plan §13.2). */
export function loadConfig(env: Env): Config {
  const name = env.NODE_ENV ?? 'development';
  if (!ENVIRONMENTS.includes(name as Environment)) {
    throw new Error(`NODE_ENV inválido: "${name}". Use development, test o production.`);
  }
  const envName = name as Environment;

  // La base de pruebas va en su propia variable y con su propio sufijo, para que nunca toque la de desarrollo.
  const urlVar = envName === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  const databaseUrl = env[urlVar];
  if (!databaseUrl) throw new Error(`Falta ${urlVar} (vea .env.example).`);
  const dbName = new URL(databaseUrl).pathname.slice(1);
  if ((envName === 'test') !== dbName.endsWith('_test')) {
    throw new Error(
      `En test la base debe terminar en "_test" y fuera de test no puede terminar así (base: ${dbName}).`,
    );
  }

  return {
    env: envName,
    port: Number(env.PORT ?? 8443),
    databaseUrl,
    dataDir: env.IMPOCARIBE_DATA_DIR ?? defaultDataDir(envName, env),
  };
}

function defaultDataDir(name: Environment, env: Env): string {
  if (name === 'production') return join(env.ProgramData ?? 'C:\\ProgramData', 'Impocaribe', 'data');
  if (name === 'test') return join(tmpdir(), 'impocaribe-test');
  return join(env.LOCALAPPDATA ?? homedir(), 'Impocaribe', 'dev-data');
}

/** Carga el `.env` de la raíz del repositorio (sin pisar variables ya definidas) y devuelve la configuración. */
export function config(): Config {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  return loadConfig(process.env);
}
