import { buildApp } from './app.js';
import { purgeExpiredSessions } from './auth/session.js';
import { config } from './config.js';
import { prisma } from './db.js';

const app = await buildApp();

const purge = () => purgeExpiredSessions().catch((err) => app.log.warn({ err }, 'Pulizia sessioni non riuscita'));
const purgeTimer = setInterval(purge, 60 * 60 * 1000);
purgeTimer.unref();

async function shutdown(signal: string) {
  app.log.info(`${signal} ricevuto, chiusura in corso`);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
