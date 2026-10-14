import { defineConfig } from 'drizzle-kit';

// Migraciones versionadas en el repositorio (Const. §5): `pnpm db:generate` las crea a partir del esquema.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
});
