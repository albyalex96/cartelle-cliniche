import { defineConfig } from 'prisma/config';
import { loadRootEnv } from './src/config';

loadRootEnv(import.meta.dirname);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
