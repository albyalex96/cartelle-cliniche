import path from 'node:path';
import { defineConfig } from 'prisma/config';

try {
  process.loadEnvFile(path.join(import.meta.dirname, '.env'));
} catch {
  // In produzione le variabili arrivano dall'ambiente del container.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
