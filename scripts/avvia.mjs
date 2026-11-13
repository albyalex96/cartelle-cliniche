/**
 * Avvio con un doppio clic (vedi "Avvia Cartelle Cliniche.bat" nella cartella principale):
 * controlla le dipendenze, avvia il database e il sito e mostra l'indirizzo da aprire nel browser.
 * Alla chiusura (finestra chiusa, Ctrl+C o errore) ferma il sito e spegne il database in modo ordinato.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, '.data', 'postgres');
const PORT = 3000;
const url = `http://localhost:${PORT}`;
const isWindows = process.platform === 'win32';
process.chdir(root);

const say = (text) => console.log(`\n== ${text}`);
const run = (command) => spawnSync(command, { cwd: root, stdio: 'inherit', shell: true }).status === 0;

function fail(text) {
  console.error(`\nERRORE: ${text}`);
  process.exit(1);
}

const portBusy = () =>
  new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: PORT }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });

if (await portBusy()) {
  console.log(`Il sito è già attivo: ${url}`);
  // Qualche secondo per leggere il messaggio prima che la finestra si chiuda.
  await new Promise((r) => setTimeout(r, 5000));
  process.exit(0);
}

// I collegamenti tra i pacchetti del progetto contengono il percorso completo della cartella:
// se la cartella è stata spostata (o è la prima volta) vanno ricreati.
if (!existsSync(path.join(root, 'node_modules', '@alby', 'core', 'package.json'))) {
  say('Preparo le dipendenze (solo la prima volta o dopo aver spostato la cartella)…');
  if (!run('npm install')) fail('installazione delle dipendenze non riuscita.');
}

// Il programma che spegne il database viene cercato subito: alla chiusura della finestra
// Windows concede pochi secondi, e non c'è tempo per altro.
let pgCtl = null;
try {
  const require = createRequire(path.join(root, 'packages', 'core', 'package.json'));
  const platform = isWindows ? 'windows' : process.platform;
  const entry = require.resolve(`@embedded-postgres/${platform}-${process.arch}`);
  pgCtl = (await import(pathToFileURL(entry).href)).pg_ctl;
} catch {
  // Senza, il database si ferma con il comando normale (più lento).
}

say('Avvio il database…');
if (!run('npm run db:start')) fail('il database non è partito (controlla .data/postgres.log).');

say('Avvio il sito…');
const web = spawn('npm run dev -w @alby/web', { cwd: root, stdio: 'inherit', shell: true });

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log('\n== Chiusura: fermo il sito e spengo il database…');
  // Il sito e i suoi processi figli.
  if (web.pid && web.exitCode === null) {
    if (isWindows) spawnSync('taskkill', ['/PID', String(web.pid), '/T', '/F'], { stdio: 'ignore' });
    else web.kill('SIGTERM');
  }
  // Il database: spegnimento "fast" = chiude le connessioni e salva tutto prima di uscire.
  if (existsSync(path.join(dataDir, 'postmaster.pid'))) {
    if (pgCtl) spawnSync(pgCtl, ['stop', '-D', dataDir, '-m', 'fast', '-w', '-s'], { stdio: 'ignore', windowsHide: true });
    else run('npm run db:stop');
  }
  console.log('== Tutto spento. Puoi chiudere la finestra.');
  process.exit(code);
}

// SIGHUP: la finestra del terminale è stata chiusa. SIGINT/SIGBREAK: Ctrl+C / Ctrl+Pausa.
for (const signal of ['SIGINT', 'SIGHUP', 'SIGBREAK', 'SIGTERM']) process.on(signal, () => shutdown(0));
web.on('exit', (code) => shutdown(code ?? 0));

// Quando il sito risponde, mostra l'indirizzo da aprire nel browser.
for (let i = 0; i < 120 && !stopping; i++) {
  if (await portBusy()) {
    say(`Pronto: ${url}`);
    console.log('   Per spegnere tutto: chiudi questa finestra (oppure premi Ctrl+C).');
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}
