import { PrismaPg } from '@prisma/adapter-pg';
import { getConfig } from './config';
import { PrismaClient } from './generated/prisma/client';

export { Prisma } from './generated/prisma/client';
export type { Patient, PatientAccess, User } from './generated/prisma/client';

// In sviluppo Next.js ricarica i moduli: si riusa lo stesso client per non aprire connessioni a vuoto.
const globalForPrisma = globalThis as unknown as { __albyPrisma?: PrismaClient };

function createClient() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: getConfig().DATABASE_URL }) });
}

export function getPrisma(): PrismaClient {
  globalForPrisma.__albyPrisma ??= createClient();
  return globalForPrisma.__albyPrisma;
}
