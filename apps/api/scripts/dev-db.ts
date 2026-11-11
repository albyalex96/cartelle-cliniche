/**
 * Avvia un PostgreSQL locale (pacchetto npm `embedded-postgres`, nessuna installazione di sistema),
 * crea il database se manca e applica le migrazioni. Resta in esecuzione finché non lo fermi (Ctrl+C).
 * I dati restano in apps/api/.data/postgres.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const apiDir = path.resolve(import.meta.dirname, '..');
try {
  process.loadEnvFile(path.join(apiDir, '.env'));
} catch {
  console.error('File apps/api/.env mancante: copia .env.example in .env');
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL ?? '');
const dbName = url.pathname.replace(/^\//, '');
const dataDir = path.join(apiDir, '.data', 'postgres');

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  // Su Windows la codifica predefinita sarebbe WIN1252: forziamo UTF-8 (accenti, simboli, ecc.).
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
});

const port = Number(url.port || 5432);
const alreadyRunning = await new Promise<boolean>((resolve) => {
  const socket = net.connect({ host: '127.0.0.1', port }, () => {
    socket.end();
    resolve(true);
  });
  socket.on('error', () => resolve(false));
});

if (alreadyRunning) {
  // Capita su Windows se una sessione precedente è stata chiusa bruscamente.
  console.log(`Un PostgreSQL è già in ascolto sulla porta ${port}: lo riutilizzo.`);
} else {
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log('Prima esecuzione: inizializzo il database in', dataDir);
    await pg.initialise();
  }
  await pg.start();
}

try {
  await pg.createDatabase(dbName);
  console.log(`Database "${dbName}" creato`);
} catch {
  // esiste già
}

const migrate = spawnSync('npx prisma migrate deploy', { cwd: apiDir, stdio: 'inherit', shell: true });
if (migrate.status !== 0) console.error('Attenzione: migrazioni non applicate');

console.log(`PostgreSQL pronto su 127.0.0.1:${url.port} (Ctrl+C per fermarlo)`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  if (!alreadyRunning) await pg.stop().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
