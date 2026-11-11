/**
 * Database PostgreSQL di sviluppo, senza installazioni di sistema e senza Docker:
 * i binari arrivano dal pacchetto npm `embedded-postgres`, i dati stanno in .data/postgres.
 *
 *   tsx scripts/dev-db.ts start   avvia (se non è già attivo), crea il database e applica le migrazioni
 *   tsx scripts/dev-db.ts stop    ferma il database
 *
 * Il server viene gestito con `pg_ctl` e resta attivo in background finché non lo fermi:
 * così chiudere il terminale (o Ctrl+C) non lascia processi orfani o dati in uno stato incerto.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { loadRootEnv } from '../src/config';

const rootDir = path.resolve(import.meta.dirname, '../../..');
const coreDir = path.resolve(import.meta.dirname, '..');
const dataRoot = path.join(rootDir, '.data');
const dataDir = path.join(dataRoot, 'postgres');
const logFile = path.join(dataRoot, 'postgres.log');

loadRootEnv(rootDir);
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL mancante: copia .env.example in .env nella cartella principale.');
  process.exit(1);
}
const url = new URL(process.env.DATABASE_URL);
const port = Number(url.port || 5432);
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const dbName = url.pathname.replace(/^\//, '');

async function binaries(): Promise<{ pg_ctl: string }> {
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  return import(`@embedded-postgres/${platform}-${process.arch}`) as Promise<{ pg_ctl: string }>;
}

function isListening(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

async function ensureDatabase() {
  const client = new pg.Client({ host: '127.0.0.1', port, user, password, database: 'postgres' });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!rowCount) {
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`Database "${dbName}" creato`);
    }
  } finally {
    await client.end();
  }
}

async function start() {
  if (await isListening()) {
    console.log(`PostgreSQL già attivo sulla porta ${port}.`);
  } else {
    if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
      console.log('Prima esecuzione: inizializzo il database in', dataDir);
      mkdirSync(dataRoot, { recursive: true });
      await new EmbeddedPostgres({
        databaseDir: dataDir,
        user,
        password,
        port,
        persistent: true,
        // Su Windows la codifica predefinita sarebbe WIN1252: forziamo UTF-8.
        initdbFlags: ['--encoding=UTF8', '--locale=C'],
        onLog: () => {},
      }).initialise();
    }
    const { pg_ctl } = await binaries();
    // stdio 'ignore': su Windows il processo postgres erediterebbe lo stdout del terminale
    // e lo terrebbe aperto, bloccando chi aspetta la fine del comando. L'output va nel file di log.
    const res = spawnSync(pg_ctl, ['start', '-D', dataDir, '-l', logFile, '-o', `-p ${port}`, '-w', '-s'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (res.status !== 0) {
      console.error(`Avvio di PostgreSQL non riuscito: controlla ${logFile}`);
      process.exit(1);
    }
    console.log(`PostgreSQL avviato sulla porta ${port}.`);
  }

  await ensureDatabase();
  const migrate = spawnSync('npx prisma migrate deploy', { cwd: coreDir, stdio: 'pipe', shell: true, encoding: 'utf8' });
  if (migrate.status !== 0) {
    console.error(migrate.stdout, migrate.stderr);
    console.error('Migrazioni non applicate.');
    process.exit(1);
  }
  const applied = migrate.stdout.match(/Applying migration `([^`]+)`/g);
  console.log(applied ? applied.join('\n') : 'Database aggiornato.');
}

async function stop() {
  if (!existsSync(path.join(dataDir, 'postmaster.pid'))) {
    console.log('PostgreSQL non è in esecuzione.');
    return;
  }
  const { pg_ctl } = await binaries();
  spawnSync(pg_ctl, ['stop', '-D', dataDir, '-m', 'fast', '-w', '-s'], { stdio: 'inherit' });
  console.log('PostgreSQL fermato.');
}

const command = process.argv[2];
if (command === 'start') await start();
else if (command === 'stop') await stop();
else {
  console.error('Uso: dev-db.ts start | stop');
  process.exit(1);
}
