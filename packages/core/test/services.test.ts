/**
 * Test della logica di sicurezza (permessi, sessioni, validazione, registro).
 * Girano su un database SEPARATO (`<nome>_test`), mai su quello con i dati reali:
 * viene creato se manca, migrato e svuotato a ogni esecuzione.
 *
 *   npm test        (con il database di sviluppo avviato: npm run db:start)
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateRawSync, inflateSync } from 'node:zlib';
import { ENCAPSULATED_PDF_SOP_CLASS } from '@alby/dicom';
import { makeDicom, makeImage } from '@alby/dicom/testing';
import { makePdf } from '@alby/pdf/testing';
import pg from 'pg';
import { loadRootEnv } from '../src/config';

// ---------------------------------------------------------------- database di test

loadRootEnv(path.resolve(import.meta.dirname, '../../..'));
const devUrl = new URL(process.env.DATABASE_URL!);
const testDb = `${devUrl.pathname.slice(1)}_test`;
const testUrl = new URL(devUrl);
testUrl.pathname = `/${testDb}`;
process.env.DATABASE_URL = testUrl.toString();
assert.ok(testDb.endsWith('_test'), 'i test devono usare un database _test');
// Anche i file (immagini DICOM) vanno in una cartella temporanea, mai nell'archivio vero.
const storageDir = mkdtempSync(path.join(tmpdir(), 'alby-test-'));
process.env.STORAGE_DIR = storageDir;

const admin = new pg.Client({ connectionString: devUrl.toString().replace(devUrl.pathname, '/postgres') });
await admin.connect();
if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDb])).rowCount) {
  await admin.query(`CREATE DATABASE "${testDb}"`);
}
await admin.end();

const migrate = spawnSync('npx prisma migrate deploy', {
  cwd: path.resolve(import.meta.dirname, '..'),
  shell: true,
  encoding: 'utf8',
  env: { ...process.env, DATABASE_URL: testUrl.toString() },
});
assert.equal(migrate.status, 0, migrate.stderr || migrate.stdout);

// Import dinamico: il client del database deve leggere l'URL di test.
const core = await import('../src/index');
const { getPrisma } = await import('../src/db');
const { resetRateLimits } = await import('../src/auth/rate-limit');
type Ctx = import('../src/context').RequestContext;

const prisma = getPrisma();
await prisma.$executeRawUnsafe('TRUNCATE users, sessions, patients, patient_access, audit_logs, files, reports, lab_results, imaging_studies, imaging_series, imaging_instances, medications, drug_packages, health_services, health_service_imports, settings CASCADE');
// I tipi di referto predefiniti (creati dalle migrazioni) restano; quelli lasciati da un test interrotto no.
await prisma.$executeRawUnsafe(`DELETE FROM report_templates WHERE id::text NOT LIKE '00000000-0000-4000-8000-%'`);

const LABORATORIO_ID = '00000000-0000-4000-8000-000000000001';
const DESCRITTIVO_ID = '00000000-0000-4000-8000-000000000002';

// ---------------------------------------------------------------- utilità

const anon = (ip = '10.0.0.1'): Ctx => ({ user: null, sessionId: null, ip, userAgent: 'test' });

async function ctxFromToken(token: string): Promise<Ctx> {
  const s = await core.resolveSession(token);
  return { user: s?.user ?? null, sessionId: s?.sessionId ?? null, ip: '10.0.0.1', userAgent: 'test' };
}

async function rejects(fn: () => Promise<unknown>, status: number, code?: string) {
  await assert.rejects(fn, (err: unknown) => {
    if (err instanceof core.AppError) {
      assert.equal(err.status, status, `status atteso ${status}, ricevuto ${err.status} (${err.message})`);
      if (code) assert.equal(err.code, code);
      return true;
    }
    if (status === 400 && (err as Error).name === 'ZodError') return true;
    const db = core.fromDatabaseError(err);
    if (db) {
      assert.equal(db.status, status);
      return true;
    }
    throw err;
  });
}

/** Un file .xlsx minimo (archivio ZIP con un foglio per tabella), per provare la lettura dei cataloghi. */
function makeXlsx(sheets: (string | number)[][][], compress = true): Uint8Array {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const strings: string[] = [];
  const files = sheets.map((rows, n) => {
    const xml = rows
      .map((row, r) => {
        const cells = row.map((v, c) => {
          const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
          if (v === '') return `<c r="${ref}"/>`;
          if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
          // Alternando stringhe condivise e stringhe scritte nella cella si provano entrambe.
          if ((r + c) % 2) return `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
          return `<c r="${ref}" t="s"><v>${strings.push(v) - 1}</v></c>`;
        });
        return `<row r="${r + 1}">${cells.join('')}</row>`;
      })
      .join('');
    return [`xl/worksheets/sheet${n + 1}.xml`, `<worksheet><sheetData>${xml}</sheetData></worksheet>`] as const;
  });
  const all = [...files, ['xl/sharedStrings.xml', `<sst>${strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`] as const];
  const parts: Buffer[] = [];
  const index: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of all) {
    const raw = Buffer.from(content, 'utf8');
    const data = compress ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(compress ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(compress ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    parts.push(local, Buffer.from(name), data);
    index.push(central, Buffer.from(name));
    offset += 30 + name.length + data.length;
  }
  const directory = Buffer.concat(index);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(all.length, 8);
  end.writeUInt16LE(all.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, directory, end]));
}

// ---------------------------------------------------------------- test

let adminCtx: Ctx;
let patientA: string;
let patientB: string;
let papaId: string;
let papaCtx: Ctx;

describe('servizi core', { concurrency: false }, () => {
  before(() => resetRateLimits());
  after(async () => {
    rmSync(storageDir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  test('setup: crea l’amministratore una sola volta', async () => {
    assert.equal(await core.needsSetup(), true);
    await rejects(() => core.setupAdmin(anon(), { displayName: 'A', email: 'x', password: 'corta' }), 400);
    const s = await core.setupAdmin(anon(), { displayName: 'Amministratore', email: 'Admin@Test.it', password: 'passwordlunga1' });
    assert.equal(s.user.email, 'admin@test.it');
    assert.equal(s.user.role, 'ADMIN');
    adminCtx = await ctxFromToken(s.token);
    assert.equal(adminCtx.user?.id, s.user.id);
    await rejects(() => core.setupAdmin(anon(), { displayName: 'Altro', email: 'b@test.it', password: 'passwordlunga1' }), 409, 'SETUP_DONE');
  });

  test('pazienti: creazione con accenti, CF duplicato, validazione, ricerca', async () => {
    const a = await core.createPatient(adminCtx, {
      firstName: 'Niccolò',
      lastName: 'D’Èsempio',
      birthDate: '1950-03-02',
      sex: 'M',
      fiscalCode: 'smpncc50c02z999x',
      bloodType: 'A+',
      notes: 'Allergia: penicillina ✓',
    });
    assert.equal(a.lastName, 'D’Èsempio');
    assert.equal(a.fiscalCode, 'SMPNCC50C02Z999X');
    patientA = a.id;
    patientB = (await core.createPatient(adminCtx, { firstName: 'Anna', lastName: 'Bianchi' })).id;

    await rejects(() => core.createPatient(adminCtx, { firstName: 'X', lastName: 'Y', fiscalCode: 'SMPNCC50C02Z999X' }), 409);
    await rejects(() => core.createPatient(adminCtx, { firstName: '', lastName: 'Y', birthDate: '2999-01-01' }), 400);

    assert.equal((await core.listPatients(adminCtx, { q: 'esemp' })).length, 1, 'ricerca senza accenti');
    assert.equal((await core.listPatients(adminCtx, { q: 'niccolo desempio' })).length, 0);
    assert.equal((await core.listPatients(adminCtx, { q: 'niccolo esempio' })).length, 1, 'più parole');
    assert.equal((await core.listPatients(adminCtx, { q: 'SMPNCC' })).length, 1, 'codice fiscale');
  });

  test('anonimo: nessun accesso ai dati', async () => {
    await rejects(() => core.listPatients(anon()), 401);
    await rejects(() => core.getPatient(anon(), patientA), 401);
    await rejects(() => core.createPatient(anon(), { firstName: 'X', lastName: 'Y' }), 401);
    await rejects(() => core.listUsers(anon()), 401);
    await rejects(() => core.listAudit(anon(), {}), 401);
  });

  test('utente paziente: password da cambiare, solo i propri pazienti, sola lettura', async () => {
    const u = await core.createUser(adminCtx, {
      displayName: 'Papà',
      email: 'papa@test.it',
      role: 'PAZIENTE',
      password: 'temporanea123',
      access: [{ patientId: patientA, canEdit: false }],
    });
    papaId = u.id;
    assert.equal(u.displayName, 'Papà');
    assert.equal(u.mustChangePassword, true);

    const s = await core.login(anon(), { email: 'PAPA@test.it', password: 'temporanea123' }, 'web');
    papaCtx = await ctxFromToken(s.token);
    await rejects(() => core.listPatients(papaCtx), 403, 'PASSWORD_CHANGE_REQUIRED');

    await rejects(() => core.changePassword(papaCtx, { currentPassword: 'sbagliata', newPassword: 'nuovapassword1' }), 400, 'WRONG_PASSWORD');
    await rejects(() => core.changePassword(papaCtx, { currentPassword: 'temporanea123', newPassword: 'temporanea123' }), 400, 'SAME_PASSWORD');
    const me = await core.changePassword(papaCtx, { currentPassword: 'temporanea123', newPassword: 'nuovapassword1' });
    assert.equal(me.mustChangePassword, false);
    papaCtx = await ctxFromToken(s.token);

    const list = await core.listPatients(papaCtx);
    assert.deepEqual(list.map((p) => p.id), [patientA]);
    assert.equal(list[0]!.canEdit, false);
    await rejects(() => core.getPatient(papaCtx, patientB), 404, 'NOT_FOUND');
    await rejects(() => core.getPatient(papaCtx, 'non-un-uuid'), 404);
    await rejects(() => core.updatePatient(papaCtx, patientA, { firstName: 'M', lastName: 'R' }), 403);
    await rejects(() => core.deletePatient(papaCtx, patientA), 403);
    await rejects(() => core.listUsers(papaCtx), 403);
    await rejects(() => core.listAudit(papaCtx, {}), 403);
  });

  test('permesso di modifica concesso dall’amministratore', async () => {
    const u = await core.updateUser(adminCtx, papaId, { access: [{ patientId: patientA, canEdit: true }] });
    assert.equal(u.access[0]!.canEdit, true);
    const p = await core.updatePatient(papaCtx, patientA, { firstName: 'Niccolò', lastName: 'D’Èsempio', phone: '333 1234567' });
    assert.equal(p.phone, '333 1234567');
  });

  test('amministratore: non può togliersi i permessi né resta senza admin', async () => {
    await rejects(() => core.updateUser(adminCtx, adminCtx.user!.id, { role: 'PAZIENTE' }), 400, 'SELF_DEMOTE');
    await rejects(() => core.updateUser(adminCtx, adminCtx.user!.id, { active: false }), 400, 'SELF_DEMOTE');
    await rejects(() => core.resetUserPassword(adminCtx, adminCtx.user!.id, { newPassword: 'qualcosa12345' }), 400, 'USE_PROFILE');
  });

  test('login: credenziali errate, utente disattivato, sessioni chiuse', async () => {
    await rejects(() => core.login(anon('10.0.0.2'), { email: 'papa@test.it', password: 'sbagliata' }, 'web'), 401, 'INVALID_CREDENTIALS');
    await rejects(() => core.login(anon('10.0.0.2'), { email: 'nessuno@test.it', password: 'x' }, 'web'), 401, 'INVALID_CREDENTIALS');

    const mobile = await core.login(anon('10.0.0.3'), { email: 'papa@test.it', password: 'nuovapassword1' }, 'mobile');
    assert.ok((await core.resolveSession(mobile.token))?.user);

    await core.updateUser(adminCtx, papaId, { active: false });
    assert.equal(await core.resolveSession(mobile.token), null, 'sessione chiusa alla disattivazione');
    await rejects(() => core.login(anon('10.0.0.3'), { email: 'papa@test.it', password: 'nuovapassword1' }, 'web'), 401);
    await core.updateUser(adminCtx, papaId, { active: true });
  });

  test('reimpostazione password: chiude le sessioni e obbliga al cambio', async () => {
    const s = await core.login(anon('10.0.0.4'), { email: 'papa@test.it', password: 'nuovapassword1' }, 'web');
    await core.resetUserPassword(adminCtx, papaId, { newPassword: 'temporanea456' });
    assert.equal(await core.resolveSession(s.token), null);
    const again = await core.login(anon('10.0.0.4'), { email: 'papa@test.it', password: 'temporanea456' }, 'web');
    assert.equal(again.user.mustChangePassword, true);
  });

  test('chiusura sessioni: solo admin, non su se stessi, password invariata', async () => {
    const web = await core.login(anon('10.0.0.5'), { email: 'papa@test.it', password: 'temporanea456' }, 'web');
    const mobile = await core.login(anon('10.0.0.5'), { email: 'papa@test.it', password: 'temporanea456' }, 'mobile');

    await rejects(() => core.closeUserSessions(papaCtx, papaId), 403);
    await rejects(() => core.closeUserSessions(adminCtx, adminCtx.user!.id), 400, 'USE_LOGOUT');

    const { closed } = await core.closeUserSessions(adminCtx, papaId);
    assert.ok(closed >= 2);
    assert.equal(await core.resolveSession(web.token), null);
    assert.equal(await core.resolveSession(mobile.token), null);
    // La password resta quella di prima.
    assert.ok(await core.login(anon('10.0.0.5'), { email: 'papa@test.it', password: 'temporanea456' }, 'web'));
    assert.equal((await core.closeUserSessions(adminCtx, papaId)).closed, 1);
  });

  test('limite di tentativi di accesso', async () => {
    resetRateLimits();
    for (let i = 0; i < 10; i++) {
      await rejects(() => core.login(anon('10.9.9.9'), { email: 'nessuno@test.it', password: 'x' }, 'web'), 401);
    }
    await rejects(() => core.login(anon('10.9.9.9'), { email: 'nessuno@test.it', password: 'x' }, 'web'), 429, 'RATE_LIMIT');
    // Da un altro indirizzo si può ancora entrare.
    await rejects(() => core.login(anon('10.9.9.8'), { email: 'nessuno@test.it', password: 'x' }, 'web'), 401);
  });

  test('token falsi o manomessi non aprono sessioni', async () => {
    assert.equal(await core.resolveSession(''), null);
    assert.equal(await core.resolveSession('a'.repeat(43)), null);
    assert.equal(await core.resolveSession('x'.repeat(5000)), null);
  });

  test('registro accessi: azioni tracciate, nessun dato sanitario nei dettagli', async () => {
    await core.getPatient(adminCtx, patientA);
    const log = await core.listAudit(adminCtx, { pageSize: 100 });
    const actions = new Set(log.items.map((i) => i.action));
    for (const a of ['setup.admin_created', 'patient.created', 'patient.viewed', 'patient.updated', 'user.created', 'auth.login', 'auth.login_failed', 'auth.password_changed', 'user.password_reset']) {
      assert.ok(actions.has(a), `manca "${a}" nel registro`);
    }
    const serialized = JSON.stringify(log.items.map((i) => i.details));
    assert.ok(!serialized.includes('penicillina'), 'le note cliniche non devono finire nel registro');
    const filtered = await core.listAudit(adminCtx, { action: 'patient.' });
    assert.ok(filtered.items.every((i) => i.action.startsWith('patient.')));
    // Ogni voce dice di chi è la scheda: il nome si legge al momento, non è salvato nel registro.
    const viewed = filtered.items.find((i) => i.action === 'patient.viewed' && i.entityId === patientA)!;
    const current = await core.getPatient(adminCtx, patientA);
    assert.equal(viewed.patientId, patientA);
    assert.equal(viewed.patientName, `${current.lastName} ${current.firstName}`);
    const created = log.items.find((i) => i.action === 'user.created')!;
    assert.ok(created.targetUserName, 'nome dell’utente su cui si è agito');
    assert.ok(log.items.filter((i) => i.action.startsWith('auth.')).every((i) => i.patientId === null && i.patientName === null));
  });

  test('tipi di referto: i due predefiniti, modifiche solo per gli amministratori, validazione', async () => {
    const initial = await core.listReportTemplates(adminCtx);
    assert.deepEqual(initial.map((t) => t.name), ['Esami di laboratorio', 'Referto descrittivo']);
    assert.deepEqual(initial[0]!.fields.map((f) => f.key), ['facility', 'reportNumber', 'doctor', 'doctorRole', 'samplingDate', 'reportDate', 'results', 'body']);
    assert.deepEqual(initial[1]!.fields.map((f) => f.key), ['facility', 'reportNumber', 'doctor', 'doctorRole', 'reportDate', 'body']);
    assert.deepEqual(initial.map((t) => t.icon), ['flask-conical', 'file-text'], 'le analisi hanno la provetta, gli altri il documento');

    const visit = {
      name: '  Visita cardiologica ',
      description: 'Visita con pressione',
      fields: [
        { key: 'doctor', type: 'text_input', label: 'Cardiologo', required: true, ocr_enabled: true },
        { key: 'c_pressione', type: 'text_input', label: 'Pressione', ocr_enabled: true },
        { key: 'c_esito', type: 'select', label: 'Esito', options: ['Nella norma', 'Da ricontrollare'], ocr_enabled: true },
        { key: 'body', type: 'rich_text', label: 'Conclusioni' },
      ],
    };
    const created = await core.createReportTemplate(adminCtx, visit);
    assert.equal(created.name, 'Visita cardiologica');
    assert.equal(created.icon, 'file-text', 'senza icona scelta: il documento');
    assert.deepEqual(created.fields[1], { key: 'c_pressione', type: 'text_input', label: 'Pressione', required: false, ocr_enabled: true, hint: '', options: [], category: '' });
    assert.equal(created.fields[2]!.ocr_enabled, false, 'un elenco di voci non si legge con l’OCR');
    assert.deepEqual((await core.listReportTemplates(adminCtx)).map((t) => t.name), ['Esami di laboratorio', 'Referto descrittivo', 'Visita cardiologica']);

    await rejects(() => core.createReportTemplate(adminCtx, { ...visit, name: 'visita CARDIOLOGICA' }), 409, 'TEMPLATE_NAME_TAKEN');
    const bad = (fields: unknown[]) => rejects(() => core.createReportTemplate(adminCtx, { name: 'Altro', fields }), 400);
    await bad([{ key: 'c_a', type: 'date', label: 'A' }, { key: 'c_a', type: 'date', label: 'B' }]);
    await bad([{ key: 'doctor', type: 'date', label: 'Medico' }]);
    await bad([{ key: 'title', type: 'text_input', label: 'Titolo' }]);
    await bad([{ key: 'c_tabella', type: 'lab_table', label: 'Valori' }]);
    await bad([{ key: 'c_scelta', type: 'select', label: 'Scelta' }]);
    await bad([{ key: 'c_x', type: 'text_input', label: ' ' }]);
    await bad([{ key: '1x', type: 'text_input', label: 'X' }]);
    await rejects(() => core.createReportTemplate(adminCtx, { name: 'Altro', icon: 'skull', fields: [] }), 400);

    const updated = await core.updateReportTemplate(adminCtx, created.id, { ...visit, name: 'Visita cardiologica', icon: 'heart-pulse', fields: visit.fields.slice(0, 2) });
    assert.equal(updated.fields.length, 2);
    assert.equal(updated.icon, 'heart-pulse');
    await rejects(() => core.updateReportTemplate(adminCtx, created.id, { ...visit, name: 'Referto descrittivo' }), 409, 'TEMPLATE_NAME_TAKEN');
    await rejects(() => core.updateReportTemplate(adminCtx, '00000000-0000-4000-8000-00000000ffff', visit), 404);

    // Chi non è amministratore li legge (per scegliere il tipo) ma non li cambia.
    await core.createUser(adminCtx, { displayName: 'Tipi', email: 'tipi@test.it', role: 'MEDICO', password: 'temporanea123', access: [] });
    const s = await core.login(anon('10.0.0.6'), { email: 'tipi@test.it', password: 'temporanea123' }, 'web');
    await core.changePassword(await ctxFromToken(s.token), { currentPassword: 'temporanea123', newPassword: 'nuovapassword1' });
    const user = await ctxFromToken(s.token);
    assert.equal((await core.listReportTemplates(user)).length, 3);
    await rejects(() => core.createReportTemplate(user, { name: 'Mio', fields: [] }), 403);
    await rejects(() => core.updateReportTemplate(user, created.id, visit), 403);
    await rejects(() => core.deleteReportTemplate(user, created.id), 403);
    await rejects(() => core.listReportTemplates(anon()), 401);

    await core.deleteReportTemplate(adminCtx, created.id);
    await rejects(() => core.deleteReportTemplate(adminCtx, created.id), 404);
    assert.equal((await core.listReportTemplates(adminCtx)).length, 2);
    const log = await core.listAudit(adminCtx, { action: 'template.', pageSize: 100 });
    assert.deepEqual(new Set(log.items.map((i) => i.action)), new Set(['template.created', 'template.updated', 'template.deleted']));
  });

  test('referti con un tipo personalizzato: campi obbligatori, valori, copia dei campi', async () => {
    const categories = [
      { key: 'k_misure', name: 'Misure', description: 'Rilevate in ambulatorio' },
      { key: 'k_vuota', name: 'Mai usata' },
    ];
    // Categorie: nomi ripetuti e campi in una categoria inesistente non si accettano.
    await rejects(() => core.createReportTemplate(adminCtx, { name: 'X', fields: [], categories: [{ key: 'k_a', name: 'A' }, { key: 'k_b', name: 'a' }] }), 400);
    await rejects(() => core.createReportTemplate(adminCtx, { name: 'X', fields: [{ key: 'c_x', type: 'date', label: 'X', category: 'k_nessuna' }] }), 400);
    const t = await core.createReportTemplate(adminCtx, {
      name: 'Visita di controllo',
      categories,
      fields: [
        { key: 'doctor', type: 'text_input', label: 'Medico', required: true },
        { key: 'c_peso', type: 'number', label: 'Peso (kg)', category: 'k_misure' },
        { key: 'c_esito', type: 'select', label: 'Esito', options: ['Buono', 'Da rivedere'], required: true },
        { key: 'c_digiuno', type: 'checkbox', label: 'A digiuno' },
        { key: 'c_prossima', type: 'date', label: 'Prossima visita' },
      ],
    });
    const base = { templateId: t.id, title: 'Controllo', examDate: '2025-06-01' };
    await rejects(() => core.createReport(adminCtx, patientA, base), 400);
    await rejects(() => core.createReport(adminCtx, patientA, { ...base, doctor: 'Dott. Rossi', custom: { c_esito: 'Ottimo' } }), 400);
    await rejects(() => core.createReport(adminCtx, patientA, { ...base, doctor: 'Dott. Rossi', custom: { c_esito: 'Buono', c_peso: 'tanto' } }), 400);
    await rejects(() => core.createReport(adminCtx, patientA, { ...base, doctor: 'Dott. Rossi', custom: { c_esito: 'Buono', c_prossima: '01/07/2025' } }), 400);
    await rejects(() => core.createReport(adminCtx, patientA, { title: 'X', examDate: '2025-06-01' }), 400);
    await rejects(() => core.createReport(adminCtx, patientA, { ...base, templateId: '00000000-0000-4000-8000-00000000ffff' }), 400, 'BAD_TEMPLATE');

    const r = await core.createReport(adminCtx, patientA, {
      ...base,
      doctor: 'Dott. Rossi',
      custom: { c_peso: ' 72,5 ', c_esito: 'Buono', c_digiuno: '', sconosciuto: 'via' },
    });
    assert.deepEqual([r.kind, r.templateId, r.templateName], ['DESCRITTIVO', t.id, 'Visita di controllo']);
    assert.deepEqual(r.custom, { c_peso: '72,5', c_esito: 'Buono' }, 'solo i campi del tipo, senza spazi né valori vuoti');
    assert.deepEqual(r.fields.map((f) => f.key), ['doctor', 'c_peso', 'c_esito', 'c_digiuno', 'c_prossima']);
    assert.deepEqual(t.categories, [{ key: 'k_misure', name: 'Misure', description: 'Rilevate in ambulatorio' }, { key: 'k_vuota', name: 'Mai usata', description: '' }]);
    assert.deepEqual(r.categories.map((c) => c.name), ['Misure'], 'nel referto solo le categorie usate dai suoi campi');
    assert.equal((await core.listReports(adminCtx, patientA)).find((x) => x.id === r.id)?.templateName, 'Visita di controllo');
    assert.equal(r.templateIcon, 'file-text');

    // Il tipo cambia: il referto salvato conserva i suoi campi (ma prende la nuova icona); modificandolo, i valori dei campi tolti restano.
    await core.updateReportTemplate(adminCtx, t.id, { name: 'Visita', icon: 'stethoscope', fields: [{ key: 'c_note', type: 'textarea', label: 'Note del medico' }] });
    assert.equal((await core.listReports(adminCtx, patientA)).find((x) => x.id === r.id)?.templateIcon, 'stethoscope');
    assert.deepEqual((await core.getReport(adminCtx, r.id)).fields.map((f) => f.key), ['doctor', 'c_peso', 'c_esito', 'c_digiuno', 'c_prossima']);
    const edited = await core.updateReport(adminCtx, r.id, { ...base, doctor: 'Dott. Rossi', custom: { ...r.custom, c_note: 'Tutto bene' } });
    assert.equal(edited.templateName, 'Visita');
    assert.deepEqual(edited.fields.map((f) => f.key), ['c_note', 'doctor', 'c_peso', 'c_esito']);
    assert.deepEqual(edited.custom, { c_note: 'Tutto bene', c_peso: '72,5', c_esito: 'Buono' });
    assert.deepEqual(edited.categories.map((c) => c.name), ['Misure'], 'il campo tenuto conserva la sua categoria');
    assert.ok(edited.fields.every((f) => f.key === 'c_note' || !f.required), 'i campi tolti dal tipo non sono più obbligatori');

    // Il tipo viene eliminato: il referto resta leggibile e modificabile con i suoi campi.
    await core.deleteReportTemplate(adminCtx, t.id);
    const orphan = await core.getReport(adminCtx, r.id);
    assert.deepEqual([orphan.templateId, orphan.templateName, orphan.fields.length], [null, 'Visita', 4]);
    assert.equal(orphan.templateIcon, 'file-text', 'tipo eliminato: l’icona predefinita del referto descrittivo');
    const kept = await core.updateReport(adminCtx, r.id, { templateId: '', title: 'Controllo', examDate: '2025-06-01', doctor: 'Dott. Rossi', custom: orphan.custom });
    assert.deepEqual([kept.templateId, kept.templateName, kept.custom.c_note], [null, 'Visita', 'Tutto bene']);

    // Cambiando il tipo in quello delle analisi, il referto diventa di laboratorio.
    const lab = await core.updateReport(adminCtx, r.id, { templateId: LABORATORIO_ID, title: 'Controllo', examDate: '2025-06-01', results: [{ name: 'Glucosio', value: '90' }] });
    assert.deepEqual([lab.kind, lab.templateName, lab.results.length], ['LABORATORIO', 'Esami di laboratorio', 1]);
    await core.deleteReport(adminCtx, r.id);
  });

  test('referti da scansione: OCR spento come prima, acceso si leggono le zone scelte', { timeout: 180_000 }, async () => {
    const { makeScannedPdf } = await import('@alby/pdf/ocr/testing');
    const config = (await import('../src/config')).getConfig();
    // Scansione INVENTATA (solo immagine, nessun testo selezionabile).
    const row = (y: number, name: string, value: string, unit: string, range: string) => [
      { x: 50, y, text: name },
      { x: 250, y, text: value },
      { x: 330, y, text: unit },
      { x: 430, y, text: range },
    ];
    const scan = await makeScannedPdf([
      [
        { x: 50, y: 800, text: 'Paziente: D ESEMPIO NICCOLO' },
        { x: 350, y: 800, text: 'Data prelievo: 02/05/2025' },
        ...row(760, 'Esame', 'Risultato', 'Unità di misura', 'Valori di riferimento'),
        ...row(725, 'Emoglobina', '11,2 *', 'g/dL', '12,0 - 16,0'),
        ...row(710, 'Piastrine', '245', 'x10^3/µL', '150 - 400'),
        ...row(695, 'Glucosio', '131', 'mg/dL', '70 - 100'),
      ],
    ]);
    const up = await core.uploadReportPdf(adminCtx, patientA, { fileName: 'scansione.pdf', bytes: scan });

    // Zone in frazioni della pagina A4 (595 x 842 punti, y misurata dall'alto).
    const band = (fromY: number, toY: number, x0 = 0.05, x1 = 0.95) => ({ x: x0, y: (842 - fromY) / 842, width: x1 - x0, height: (fromY - toY) / 842 });

    const previous = config.OCR_ENABLED;
    try {
      config.OCR_ENABLED = false;
      const off = await core.prepareReportDraft(adminCtx, patientA, up.file.id);
      assert.equal(off.parser, null);
      assert.equal(off.scan, null);
      assert.deepEqual(off.values.results, []);
      assert.match(off.warnings[0]!, /non contiene testo selezionabile/);
      await rejects(() => core.readScanArea(adminCtx, up.file.id, { page: 1, mode: 'page' }), 404, 'OCR_DISABLED');

      config.OCR_ENABLED = true;
      // Nessuna lettura automatica: il form resta vuoto e si scelgono le zone sul documento.
      const draft = await core.prepareReportDraft(adminCtx, patientA, up.file.id);
      assert.deepEqual(draft.scan?.pages, [{ width: 595, height: 842 }]);
      assert.deepEqual(draft.values.results, []);
      assert.match(draft.warnings[0]!, /seleziona sul documento/);
      assert.equal(await prisma.auditLog.count({ where: { action: 'report.file_ocr', entityId: up.file.id } }), 0, 'nessun OCR finché non lo chiede l’utente');

      const preview = await core.getPdfPagePreview(adminCtx, up.file.id, 1);
      assert.equal(preview.subarray(0, 2).toString('hex'), 'ffd8', 'anteprima JPEG');
      await rejects(() => core.getPdfPagePreview(adminCtx, up.file.id, 2), 404);

      // Immagini del referto: ritaglio di una zona del PDF e foto caricata, salvati come studi DICOM del paziente.
      const crop = await core.addReportImage(adminCtx, patientA, {
        kind: 'crop',
        input: { fileId: up.file.id, page: 1, region: band(812, 792), studyDate: '2025-05-02' },
      });
      const { createCanvas } = await import('@napi-rs/canvas');
      const photo = new Uint8Array(await createCanvas(64, 32).encode('png'));
      const uploaded = await core.addReportImage(adminCtx, patientA, { kind: 'upload', fileName: 'C:\\foto\\foto-prova.png', bytes: photo });
      const studies = await core.listImagingStudies(adminCtx, patientA);
      const cropped = studies.find((x) => x.id === crop.studyId)!;
      assert.equal(cropped.description, 'Ritaglio dal PDF, pagina 1');
      assert.equal(cropped.studyDate, '2025-05-02');
      assert.deepEqual(cropped.modalities, ['OT']);
      assert.equal(cropped.imageCount, 1);
      assert.equal(studies.find((x) => x.id === uploaded.studyId)?.description, 'Immagine: foto-prova');
      await rejects(() => core.addReportImage(adminCtx, patientA, { kind: 'upload', fileName: 'x.pdf', bytes: scan }), 415, 'BAD_IMAGE');
      // Il PDF di A non si ritaglia passando dal paziente B.
      await rejects(() => core.addReportImage(adminCtx, patientB, { kind: 'crop', input: { fileId: up.file.id, page: 1, region: band(812, 792) } }), 404);
      for (const id of [crop.studyId, uploaded.studyId]) await core.deleteImagingStudy(adminCtx, id);

      // Zona con le righe dei valori (anche senza l'intestazione della tabella).
      const table = await core.readScanArea(adminCtx, up.file.id, { page: 1, mode: 'table', region: band(740, 686) });
      assert.equal(table.mode, 'table');
      if (table.mode !== 'table') return;
      assert.deepEqual(
        table.rows.map((r) => r.name),
        ['Emoglobina', 'Piastrine', 'Glucosio'],
      );
      assert.equal(table.rows[0]!.value, '11,2');
      assert.equal(table.rows[0]!.outOfRange, true);
      assert.equal(table.parser.id, 'generico-ocr');

      // Zona con una data, per un campo del form.
      const date = await core.readScanArea(adminCtx, up.file.id, { page: 1, mode: 'date', region: band(812, 792, 0.57, 0.95) });
      assert.equal(date.mode === 'date' && date.text, '2025-05-02');

      // Lettura facoltativa di tutta la pagina.
      const page = await core.readScanArea(adminCtx, up.file.id, { page: 1, mode: 'page' });
      assert.equal(page.mode === 'page' && page.values.results.find((r) => r.name === 'Glucosio')?.value, '131');

      await rejects(() => core.readScanArea(adminCtx, up.file.id, { page: 1, mode: 'table' }), 400, 'NO_REGION');
      await rejects(() => core.readScanArea(adminCtx, up.file.id, { page: 9, mode: 'page' }), 400, 'PAGE_NOT_FOUND');

      // Nel registro solo numeri, mai il testo riconosciuto.
      const entries = await prisma.auditLog.findMany({ where: { action: 'report.file_ocr', entityId: up.file.id } });
      assert.ok(entries.length >= 3);
      const details = JSON.stringify(entries.map((e) => e.details));
      assert.match(details, /"ok":true/);
      assert.doesNotMatch(details, /Glucosio|ESEMPIO|131|2025/);

      const created = await core.createReport(adminCtx, patientA, { ...draft.values, kind: 'LABORATORIO', title: 'Esami', examDate: '2025-05-02', results: table.rows }, { fileId: up.file.id, parser: table.parser });
      assert.equal(created.parserId, 'generico-ocr', 'il referto resta segnato come letto da una scansione');
      // Modifica del referto: il PDF salvato si riconosce come scansione (solo misure, nessun contenuto).
      assert.deepEqual(await core.getReportDocument(adminCtx, up.file.id), { pages: [{ width: 595, height: 842 }], scan: { pages: [{ width: 595, height: 842 }] } });
      config.OCR_ENABLED = false;
      assert.equal((await core.getReportDocument(adminCtx, up.file.id)).scan, null);
      config.OCR_ENABLED = true;
      // PDF già diventato referto: le sue zone si leggono e si ritagliano ancora, modificando il referto.
      const again = await core.readScanArea(adminCtx, up.file.id, { page: 1, mode: 'date', region: band(812, 792, 0.57, 0.95) });
      assert.equal(again.mode === 'date' && again.text, '2025-05-02');
      const later = await core.addReportImage(adminCtx, patientA, { kind: 'crop', input: { fileId: up.file.id, page: 1, region: band(812, 792) } });
      await core.deleteImagingStudy(adminCtx, later.studyId);
      // ...ma non passando da un altro paziente.
      await rejects(() => core.addReportImage(adminCtx, patientB, { kind: 'crop', input: { fileId: up.file.id, page: 1, region: band(812, 792) } }), 404);
      await core.deleteReport(adminCtx, created.id);
    } finally {
      config.OCR_ENABLED = previous;
    }
  });

  test('referti: PDF caricato, proposta, salvataggio, duplicati, permessi', async () => {
    // Referto INVENTATO, intestato al paziente A (stesso codice fiscale).
    const pdf = makePdf([
      [
        { x: 31, y: 667, text: 'Cognome e nome: D ESEMPIO NICCOLO' },
        { x: 31, y: 652, text: 'Codice fiscale:' },
        { x: 121, y: 652, text: 'SMPNCC50C02Z999X' },
        { x: 31, y: 622, text: 'Data esame:' },
        { x: 121, y: 622, text: '14.03.2024' },
        { x: 30, y: 561, text: 'RM GINOCCHIO DESTRO' },
        { x: 28, y: 470, text: 'Menisco mediale integro.' },
        { x: 387, y: 194, text: 'Lo Specialista Radiologo' },
        { x: 401, y: 177, text: 'Dott. Amedeo Filani' },
      ],
    ]);

    await rejects(() => core.uploadReportPdf(adminCtx, patientA, { fileName: 'x.pdf', bytes: new Uint8Array() }), 400, 'EMPTY_FILE');
    await rejects(() => core.uploadReportPdf(adminCtx, patientA, { fileName: 'x.pdf', bytes: Buffer.from('<html>ciao</html>') }), 415, 'NOT_PDF');

    const up = await core.uploadReportPdf(adminCtx, patientA, { fileName: '..\\..\\Referto "RM".pdf', bytes: pdf });
    assert.equal(up.file.fileName, 'Referto RM.pdf', 'nome del file ripulito');
    const again = await core.uploadReportPdf(adminCtx, patientA, { fileName: 'copia.pdf', bytes: pdf });
    assert.equal(again.file.id, up.file.id, 'lo stesso PDF non viene duplicato');
    const stored = await core.getReportPdf(adminCtx, up.file.id);
    assert.equal(stored.mimeType, 'application/pdf');
    assert.deepEqual(new Uint8Array(stored.data), pdf, 'il PDF salvato è identico all’originale');

    // Il PDF di A non si può usare per B.
    await rejects(() => core.prepareReportDraft(adminCtx, patientB, up.file.id), 404);

    const draft = await core.prepareReportDraft(adminCtx, patientA, up.file.id);
    assert.equal(draft.identity?.status, 'ok');
    assert.equal(draft.values.templateId, DESCRITTIVO_ID, 'proposto il tipo predefinito senza tabella dei valori');
    assert.equal(draft.values.title, 'RM GINOCCHIO DESTRO');
    assert.equal(draft.values.examDate, '2024-03-14');
    assert.equal(draft.values.doctor, 'Dott. Amedeo Filani');

    const created = await core.createReport(adminCtx, patientA, draft.values, { fileId: up.file.id, parser: draft.parser });
    assert.equal(created.parserId, 'generico');
    assert.deepEqual([created.kind, created.templateId, created.templateName], ['DESCRITTIVO', DESCRITTIVO_ID, 'Referto descrittivo']);
    assert.equal(created.file?.id, up.file.id);
    assert.equal((await core.uploadReportPdf(adminCtx, patientA, { fileName: 'x.pdf', bytes: pdf })).existingReportId, created.id);
    await rejects(() => core.prepareReportDraft(adminCtx, patientA, up.file.id), 409, 'ALREADY_IMPORTED');
    await rejects(() => core.createReport(adminCtx, patientA, draft.values, { fileId: up.file.id }), 409, 'ALREADY_IMPORTED');
    await rejects(() => core.discardReportPdf(adminCtx, up.file.id), 409, 'FILE_IN_USE');
    // PDF con testo: in modifica nessuna selezione per l'OCR, ma si può ritagliare.
    const doc = await core.getReportDocument(adminCtx, up.file.id);
    assert.equal(doc.scan, null);
    assert.ok(doc.pages?.length);
    // Modifica: il lettore resta se non si usa l'OCR (o se ne arriva un altro), diventa quello della scansione se lo si usa.
    const edit = (parser?: { id: string; version: number }) => core.updateReport(adminCtx, created.id, draft.values, { parser });
    assert.equal((await edit()).parserId, 'generico');
    assert.equal((await edit({ id: 'inventato', version: 9 })).parserId, 'generico');
    const scanned = await edit({ id: 'generico-ocr', version: 3 });
    assert.deepEqual([scanned.parserId, scanned.parserVersion], ['generico-ocr', 3]);

    // Identità diversa: il PDF di A caricato su B viene segnalato.
    const other = await core.uploadReportPdf(adminCtx, patientB, { fileName: 'altro.pdf', bytes: pdf });
    assert.equal((await core.prepareReportDraft(adminCtx, patientB, other.file.id)).identity?.status, 'mismatch');
    await core.discardReportPdf(adminCtx, other.file.id);
    await rejects(() => core.getReportPdf(adminCtx, other.file.id), 404);

    // Inserimento a mano di analisi: valore numerico e "fuori range" calcolati dal server.
    await rejects(() => core.createReport(adminCtx, patientB, { kind: 'LABORATORIO', title: 'X', examDate: '2999-01-01' }), 400);
    const lab = await core.createReport(adminCtx, patientB, {
      kind: 'LABORATORIO',
      title: 'Esami del sangue',
      examDate: '2025-05-02',
      results: [
        { section: 'EMOCROMO', name: 'Emoglobina', value: '11,2', unit: 'g/dL', referenceRange: '12,0 - 16,0' },
        { name: 'Glucosio', value: '92', unit: 'mg/dL', referenceRange: '70 - 100', outOfRange: true },
        { name: 'Urine: proteine', value: 'Negativo' },
      ],
    });
    assert.deepEqual(
      lab.results.map((r) => [r.name, r.numericValue, r.outOfRange]),
      [
        ['Emoglobina', 11.2, true],
        ['Glucosio', 92, true],
        ['Urine: proteine', null, null],
      ],
    );
    const summary = await core.listReports(adminCtx, patientB);
    assert.deepEqual(summary.map((s) => [s.title, s.resultCount, s.outOfRangeCount, s.hasFile]), [['Esami del sangue', 3, 2, false]]);

    const ocrParser = { id: 'generico-ocr', version: 1 };
    const updated = await core.updateReport(
      adminCtx,
      lab.id,
      { kind: 'LABORATORIO', title: 'Esami del sangue', examDate: '2025-05-02', results: [{ name: 'Ferritina', value: '45' }] },
      { parser: ocrParser },
    );
    assert.deepEqual(updated.results.map((r) => r.name), ['Ferritina']);
    assert.equal(updated.parserId, null, 'senza PDF il lettore della scansione non si salva');

    // Utente con sola lettura sul paziente B.
    await core.createUser(adminCtx, { displayName: 'Lettore', email: 'lettore@test.it', role: 'MEDICO', password: 'temporanea123', access: [{ patientId: patientB, canEdit: false }] });
    const s = await core.login(anon('10.0.0.7'), { email: 'lettore@test.it', password: 'temporanea123' }, 'web');
    await core.changePassword(await ctxFromToken(s.token), { currentPassword: 'temporanea123', newPassword: 'nuovapassword1' });
    const reader = await ctxFromToken(s.token);
    assert.equal((await core.listReports(reader, patientB)).length, 1);
    assert.equal((await core.getReport(reader, lab.id)).canEdit, false);
    await rejects(() => core.updateReport(reader, lab.id, { kind: 'LABORATORIO', title: 'X', examDate: '2025-01-01' }), 403);
    await rejects(() => core.deleteReport(reader, lab.id), 403);
    await rejects(() => core.uploadReportPdf(reader, patientB, { fileName: 'x.pdf', bytes: pdf }), 403);
    await rejects(() => core.createReport(reader, patientB, { kind: 'LABORATORIO', title: 'X', examDate: '2025-01-01' }), 403);
    // Nessun accesso ai referti e ai PDF di A: "non trovato", come se non esistessero.
    await rejects(() => core.getReport(reader, created.id), 404);
    await rejects(() => core.getReportPdf(reader, up.file.id), 404);
    await rejects(() => core.listReports(reader, patientA), 404);
    await rejects(() => core.getReport(anon(), lab.id), 401);

    // Eliminazione: sparisce anche il PDF.
    await core.deleteReport(adminCtx, created.id);
    await rejects(() => core.getReport(adminCtx, created.id), 404);
    await rejects(() => core.getReportPdf(adminCtx, up.file.id), 404);

    const log = await core.listAudit(adminCtx, { action: 'report.', pageSize: 100 });
    const actions = new Set(log.items.map((i) => i.action));
    for (const a of ['report.file_uploaded', 'report.file_discarded', 'report.file_viewed', 'report.created', 'report.viewed', 'report.updated', 'report.deleted']) {
      assert.ok(actions.has(a), `manca "${a}" nel registro`);
    }
    const serialized = JSON.stringify(log.items.map((i) => i.details));
    assert.ok(!/menisco|emoglobina|ginocchio|filani/i.test(serialized), 'nessun dato sanitario nel registro');
  });

  test('immagini DICOM: salvate così come sono, senza doppioni, con permessi', async () => {
    // Immagini INVENTATE.
    const rm = { patient: 'D ESEMPIO^NICCOLO', study: '1.2.3.100', studyDate: '20240314', studyDescription: 'RM GINOCCHIO DX', modality: 'MR' };
    const im1 = makeImage({ ...rm, series: '1.2.3.100.1', seriesNumber: '1', seriesDescription: 'T1 SAG' });
    const im2 = makeImage({ ...rm, series: '1.2.3.100.1', seriesNumber: '1' });
    const im3 = makeImage({ ...rm, series: '1.2.3.100.2', seriesNumber: '2', modality: 'CT' });
    const pdfDoc = makeDicom(
      [['0020000D', 'UI', '1.2.3.100'], ['0020000E', 'UI', '1.2.3.100.9'], ['00080016', 'UI', ENCAPSULATED_PDF_SOP_CLASS], ['00420011', 'OB', new TextEncoder().encode('%PDF-1.4')]],
      { sopClass: ENCAPSULATED_PDF_SOP_CLASS },
    );

    const r = await core.uploadDicomFiles(adminCtx, patientA, [
      { name: 'DICOM/IM1', bytes: im1 },
      { name: 'DICOM/IM2', bytes: im2 },
      { name: 'DICOM/IM3', bytes: im3 },
      { name: 'viewer.exe', bytes: new Uint8Array(500) },
      { name: 'DICOM/DOC', bytes: pdfDoc },
    ]);
    assert.equal(r.added, 3);
    assert.deepEqual(r.rejected.map((x) => x.name), ['viewer.exe', 'DOC']);
    // Lo stesso CD caricato di nuovo: nessuna immagine duplicata.
    const again = await core.uploadDicomFiles(adminCtx, patientA, [{ name: 'IM1', bytes: im1 }]);
    assert.deepEqual([again.added, again.duplicates], [0, 1]);

    const [study] = await core.listImagingStudies(adminCtx, patientA);
    assert.equal(study?.description, 'RM GINOCCHIO DX');
    assert.equal(study?.studyDate, '2024-03-14');
    assert.deepEqual(study?.modalities, ['MR', 'CT']);
    assert.deepEqual([study?.seriesCount, study?.imageCount, study?.bytes], [2, 3, im1.length + im2.length + im3.length]);

    // Il file salvato è identico all'originale.
    const inst = await prisma.imagingInstance.findFirstOrThrow({ where: { sha256: { not: '' } }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(new Uint8Array(readFileSync(path.join(storageDir, inst.storagePath))), im1);

    // Permessi: il lettore vede solo B, in sola lettura.
    const s = await core.login(anon('10.0.0.8'), { email: 'lettore@test.it', password: 'nuovapassword1' }, 'web');
    const reader = await ctxFromToken(s.token);
    await rejects(() => core.uploadDicomFiles(reader, patientA, [{ name: 'x', bytes: im1 }]), 404);
    await rejects(() => core.uploadDicomFiles(reader, patientB, [{ name: 'x', bytes: im1 }]), 403);
    await rejects(() => core.listImagingStudies(reader, patientA), 404);
    await rejects(() => core.deleteImagingStudy(reader, study!.id), 404);
    assert.deepEqual(await core.listImagingStudies(reader, patientB), []);

    // Consultazione: serie e immagini in ordine, anteprima PNG calcolata una volta e conservata.
    const u16 = (n: number) => new Uint8Array([n & 0xff, n >> 8]);
    const picture = makeImage({
      ...rm,
      series: '1.2.3.100.3',
      seriesNumber: '3',
      extra: [
        ['00280002', 'US', u16(1)], ['00280004', 'CS', 'MONOCHROME2'], ['00280010', 'US', u16(2)], ['00280011', 'US', u16(2)],
        ['00280100', 'US', u16(16)], ['00280101', 'US', u16(12)], ['00280103', 'US', u16(0)], ['00280030', 'DS', '0.5\\0.4'],
        ['7FE00010', 'OW', new Uint8Array([0, 0, 0x10, 0, 0x20, 0, 0x30, 0])],
      ],
    });
    await core.uploadDicomFiles(adminCtx, patientA, [{ name: 'IM4', bytes: picture }]);
    const detail = await core.getImagingStudy(adminCtx, study!.id);
    assert.deepEqual(detail.series.map((x) => [x.number, x.description, x.instances.length]), [[1, 'T1 SAG', 2], [2, null, 1], [3, null, 1]]);
    assert.equal((await core.listImagingStudies(adminCtx, patientA))[0]?.coverInstanceId, detail.series[0]!.instances[0]!.id);
    const pictureId = detail.series[2]!.instances[0]!.id;
    const png = await core.getImagingPreview(adminCtx, pictureId, 'thumb');
    assert.equal(png.mimeType, 'image/png');
    assert.deepEqual([...png.data.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.deepEqual(inflateSync(png.data.subarray(41, png.data.length - 16)), Buffer.from([0, 0, 85, 0, 170, 255]), 'pixel a 8 bit, riga per riga');
    assert.ok(existsSync(path.join(storageDir, 'dicom', patientA, study!.id, `${pictureId}.thumb.png`)), 'anteprima conservata');
    assert.deepEqual(await core.getImagingPreview(adminCtx, pictureId, 'thumb'), png);
    // Un file senza immagine leggibile non ha anteprima; chi non può vedere il paziente non vede nulla.
    await rejects(() => core.getImagingPreview(adminCtx, detail.series[0]!.instances[0]!.id), 415);
    await rejects(() => core.getImagingPreview(reader, pictureId), 404);
    // Scala per misurare le distanze, letta dal file; stessi permessi dell'anteprima.
    assert.deepEqual(await core.getImagingGeometry(adminCtx, pictureId), { rows: 2, columns: 2, spacing: { row: 0.5, column: 0.4 }, spacingSource: 'patient' });
    await rejects(() => core.getImagingGeometry(adminCtx, detail.series[0]!.instances[0]!.id), 415);
    await rejects(() => core.getImagingGeometry(reader, pictureId), 404);
    await rejects(() => core.getImagingStudy(reader, study!.id), 404);

    // Collegamento al referto testuale: solo referti dello stesso paziente, solo chi può modificare.
    const text = await core.createReport(adminCtx, patientA, { kind: 'DESCRITTIVO', title: 'RM ginocchio destro', examDate: '2024-03-14', body: 'Menisco mediale regolare.' });
    const other = await core.createReport(adminCtx, patientB, { kind: 'DESCRITTIVO', title: 'Visita', examDate: '2024-03-14', body: 'Nulla da segnalare.' });
    assert.equal(detail.report, null);
    await core.linkImagingStudyReport(adminCtx, study!.id, text.id);
    const linked = await core.getImagingStudy(adminCtx, study!.id);
    assert.deepEqual([linked.report?.id, linked.report?.body, linked.canEdit], [text.id, 'Menisco mediale regolare.', true]);
    assert.deepEqual((await core.listReportImagingStudies(adminCtx, text.id)).map((x) => x.id), [study!.id]);
    await rejects(() => core.linkImagingStudyReport(adminCtx, study!.id, other.id), 404);
    await rejects(() => core.linkImagingStudyReport(reader, study!.id, text.id), 404);
    await rejects(() => core.listReportImagingStudies(reader, text.id), 404);
    // Dal form del referto: l'elenco degli studi collegati viene sostituito in blocco.
    await core.setReportImagingStudies(adminCtx, text.id, []);
    assert.equal((await core.getImagingStudy(adminCtx, study!.id)).report, null);
    await core.setReportImagingStudies(adminCtx, text.id, [study!.id, study!.id]);
    assert.equal((await core.listImagingStudies(adminCtx, patientA))[0]?.reportId, text.id);
    await rejects(() => core.setReportImagingStudies(adminCtx, other.id, [study!.id]), 404);
    await rejects(() => core.setReportImagingStudies(reader, text.id, []), 404);
    assert.equal((await core.listImagingStudies(adminCtx, patientA))[0]?.reportId, text.id, 'i tentativi rifiutati non cambiano nulla');
    // Eliminando il referto le immagini restano, senza collegamento.
    await core.deleteReport(adminCtx, text.id);
    assert.equal((await core.getImagingStudy(adminCtx, study!.id)).report, null);
    await core.linkImagingStudyReport(adminCtx, study!.id, null);
    await core.deleteReport(adminCtx, other.id);

    // Nome dello studio: lo cambia solo chi può modificare; vuoto lo toglie.
    await core.renameImagingStudy(adminCtx, study!.id, '  RM ginocchio destro  ');
    assert.equal((await core.listImagingStudies(adminCtx, patientA))[0]?.description, 'RM ginocchio destro');
    await rejects(() => core.renameImagingStudy(reader, study!.id, 'Altro'), 404);
    await core.renameImagingStudy(adminCtx, study!.id, '');
    assert.equal((await core.listImagingStudies(adminCtx, patientA))[0]?.description, null);

    // Eliminazione dello studio: spariscono anche i file.
    const studyDir = path.join(storageDir, 'dicom', patientA, study!.id);
    assert.ok(existsSync(studyDir));
    await core.deleteImagingStudy(adminCtx, study!.id);
    assert.ok(!existsSync(studyDir), 'cartella dello studio eliminata');
    assert.deepEqual(await core.listImagingStudies(adminCtx, patientA), []);

    // Di nuovo, per verificare che l'eliminazione del paziente cancelli i file (test successivo).
    await core.uploadDicomFiles(adminCtx, patientA, [{ name: 'IM1', bytes: im1 }]);
    const log = await core.listAudit(adminCtx, { action: 'imaging.' });
    assert.ok(log.items.some((i) => i.action === 'imaging.uploaded') && log.items.some((i) => i.action === 'imaging.study_viewed') && log.items.some((i) => i.action === 'imaging.study_deleted'));
    assert.ok(log.items.some((i) => i.action === 'imaging.study_linked'));
    assert.ok(!/ginocchio|esempio|menisco/i.test(JSON.stringify(log.items.map((i) => i.details))), 'nessun dato sanitario nel registro');
  });

  test('terapie: inserimento, conclusione, ordine, permessi', async () => {
    const reader = await ctxFromToken((await core.login(anon('10.0.0.9'), { email: 'lettore@test.it', password: 'nuovapassword1' }, 'web')).token);
    const a = await core.createMedication(adminCtx, patientB, {
      name: 'Cardioaspirin 100 mg',
      activeIngredient: 'Acido acetilsalicilico',
      strength: '100 mg',
      form: 'Compressa gastroresistente',
      dosage: '1 compressa',
      frequency: 'a pranzo',
      startDate: '2024-01-10',
    });
    assert.equal(a.active, true);
    assert.deepEqual([a.strength, a.form, a.dosage], ['100 mg', 'Compressa gastroresistente', '1 compressa']);
    await core.createMedication(adminCtx, patientB, { name: 'Amoxicillina', startDate: '2024-02-01', endDate: '2024-02-07', asNeeded: false });
    await core.createMedication(adminCtx, patientB, { name: 'Tachipirina', asNeeded: true, aic: '012745' });
    await rejects(() => core.createMedication(adminCtx, patientB, { name: '' }), 400);
    await rejects(() => core.createMedication(adminCtx, patientB, { name: 'X', startDate: '2024-03-01', endDate: '2024-02-01' }), 400);
    await rejects(() => core.createMedication(adminCtx, patientB, { name: 'X', aic: '12' }), 400);

    let list = await core.listMedications(reader, patientB);
    assert.deepEqual(list.map((m) => [m.name, m.active]), [['Cardioaspirin 100 mg', true], ['Tachipirina', true], ['Amoxicillina', false]]);

    // Il lettore vede ma non modifica; chi non ha accesso non trova nulla.
    await rejects(() => core.createMedication(reader, patientB, { name: 'X' }), 403);
    await rejects(() => core.stopMedication(reader, a.id), 403);
    await rejects(() => core.deleteMedication(reader, a.id), 403);
    await rejects(() => core.listMedications(reader, patientA), 404);

    const stopped = await core.stopMedication(adminCtx, a.id);
    assert.equal(stopped.active, false);
    assert.equal(stopped.endDate, new Date().toISOString().slice(0, 10));
    const edited = await core.updateMedication(adminCtx, a.id, { name: 'Cardioaspirin', startDate: '2024-01-10', endDate: '' });
    assert.equal(edited.active, true);
    assert.deepEqual([edited.strength, edited.form], [null, null], 'campi svuotati dal modulo');
    await core.deleteMedication(adminCtx, a.id);
    list = await core.listMedications(adminCtx, patientB);
    assert.equal(list.length, 2);

    const log = await core.listAudit(adminCtx, { action: 'medication.' });
    assert.deepEqual(new Set(log.items.map((i) => i.action)), new Set(['medication.created', 'medication.stopped', 'medication.updated', 'medication.deleted']));
    assert.ok(!/cardio|aspirin|amoxi|tachi/i.test(JSON.stringify(log.items.map((i) => i.details))), 'nessun dato sanitario nel registro');
  });

  test('elenco farmaci AIFA: importazione e ricerca', async () => {
    const csv = [
      '"CODICE_AIC";"COD_FARMACO";"COD_CONFEZIONE";"DENOMINAZIONE";"DESCRIZIONE";"CODICE_DITTA";"RAGIONE_SOCIALE";"STATO_AMMINISTRATIVO";"TIPO_PROCEDURA";"FORMA";"CODICE_ATC";"PA_ASSOCIATI";"FORNITURA";"LINK_FI";"LINK_RCP"',
      '"012745028";"012745";"028";"TACHIPIRINA";"500 MG COMPRESSE-10 COMPRESSE";219;"ACRAF S.P.A.";"Autorizzata";"Procedura Nazionale";"Compressa";"N02BE01";"PARACETAMOLO";"SOP";"https://api.aifa.gov.it/x/12745?ts=FI";""',
      '"012745030";"012745";"030";"TACHIPIRINA";"1000 MG COMPRESSE-16 COMPRESSE";219;"ACRAF S.P.A.";"Autorizzata";"Procedura Nazionale";"Compressa";"N02BE01";"PARACETAMOLO";"SOP";"https://api.aifa.gov.it/x/12745?ts=FI";""',
      '"024840074";"024840";"074";"CARDIOASPIRIN";"100 MG COMPRESSE GASTRORESISTENTI; 30 CPR";1;"BAYER S.P.A.";"Autorizzata";"Procedura Nazionale";"Compressa gastroresistente";"B01AC06";"ACIDO ACETILSALICILICO";"RR";"javascript:alert(1)";""',
      '"099999011";"099999";"011";"VECCHIOFARMACO";"""GOCCE"" 10 ML";1;"X";"Revocata";"";"Gocce orali";"";"PARACETAMOLO";"";"";""',
      '"012745093";"012745";"093";"TACHIPIRINA";"""120 MG/5 ML SCIROPPO"" FLACONE DA 120 ML";219;"ACRAF S.P.A.";"Autorizzata";"Procedura Nazionale";"Sciroppo";"N02BE01";"PARACETAMOLO";"SOP";"";""',
      '"012745105";"012745";"105";"TACHIPIRINA";"""500 MG COMPRESSE"" 30 COMPRESSE";219;"ACRAF S.P.A.";"Autorizzata";"Procedura Nazionale";"Compressa";"N02BE01";"PARACETAMOLO";"SOP";"";""',
      '"012745117";"012745";"117";"TACHIPIRINA";"""250 MG SUPPOSTE"" 10 SUPPOSTE";219;"ACRAF S.P.A.";"Revocata";"Procedura Nazionale";"Supposta";"N02BE01";"PARACETAMOLO";"SOP";"";""',
    ].join('\r\n');
    const rows = core.drugRowsFromCsv(core.decodeCsv(new TextEncoder().encode(csv)));
    assert.equal(rows.length, 7);
    assert.equal(rows[2]!.package, '100 MG COMPRESSE GASTRORESISTENTI; 30 CPR', 'separatore dentro le virgolette');
    assert.equal(rows[2]!.leafletUrl, null, 'solo link https');
    assert.equal(rows[3]!.package, '"GOCCE" 10 ML');
    assert.throws(() => core.drugRowsFromCsv('a;b\n1;2'), /AIFA/);

    // Prima dell'importazione la ricerca avvisa che l'elenco manca.
    assert.deepEqual(await core.searchDrugs(adminCtx, 'tachi'), { catalogReady: false, approximate: false, items: [] });
    await core.replaceDrugCatalog(rows);
    const status = await core.getDrugCatalogStatus(adminCtx);
    assert.deepEqual([status.packages, status.products], [7, 3]);

    const byName = await core.searchDrugs(adminCtx, 'Tachipirina');
    assert.equal(byName.items.length, 1);
    assert.deepEqual([byName.items[0]!.aic, byName.items[0]!.name, byName.items[0]!.activeIngredient], ['012745', 'Tachipirina', 'Paracetamolo']);
    assert.equal(byName.items[0]!.packages.length, 4, 'nei suggerimenti solo alcune confezioni');
    const byIngredient = await core.searchDrugs(adminCtx, 'paracetamolo');
    assert.deepEqual(byIngredient.items.map((i) => [i.name, i.withdrawn]), [['Tachipirina', false], ['Vecchiofarmaco', true]]);
    assert.equal((await core.searchDrugs(adminCtx, 'tachipirina 1000')).items[0]!.packages.length, 1, 'più parole');
    assert.equal(byIngredient.approximate, false);

    // Principio attivo: prima i nomi commerciali, poi gli equivalenti che si chiamano come il principio attivo;
    // chi contiene solo quello prima delle associazioni; i farmaci ritirati in fondo. Nessun taglio per ordine alfabetico.
    const extra = (code: string, name: string, pa: string, status = 'Autorizzata') => ({
      aic: `${code}011`,
      name,
      package: '"500 MG COMPRESSE" 20 COMPRESSE',
      activeIngredient: pa,
      holder: 'X',
      form: 'Compressa',
      atc: null,
      status,
      supply: null,
      leafletUrl: null,
      searchText: `${name} ${pa} 500 mg compresse 20 compresse`.toLowerCase().replace(/[^a-z0-9]+/g, ' '),
    });
    await core.replaceDrugCatalog([
      ...rows,
      extra('200001', 'PARACETAMOLO ALFA', 'PARACETAMOLO'),
      extra('200002', 'ZETADOL', 'PARACETAMOLO/CODEINA FOSFATO'),
      extra('200003', 'ANTICOPIRINA', 'PARACETAMOLO', 'Revocata'),
    ]);
    assert.deepEqual((await core.searchDrugs(adminCtx, 'paracetamolo')).items.map((i) => i.name), ['Tachipirina', 'Zetadol', 'Paracetamolo Alfa', 'Anticopirina', 'Vecchiofarmaco']);
    assert.deepEqual((await core.searchDrugs(adminCtx, 'paracetamolo codeina')).items.map((i) => i.name), ['Zetadol']);

    // Errori di battitura: nessuna corrispondenza esatta → i nomi più simili, segnalati come tali.
    for (const typo of ['tachipirna', 'tacchipirina', 'takipirina']) {
      const similar = await core.searchDrugs(adminCtx, typo);
      assert.equal(similar.approximate, true, typo);
      assert.equal(similar.items[0]!.name, 'Tachipirina', typo);
    }
    const typoIngredient = await core.searchDrugs(adminCtx, 'paracetamollo');
    assert.equal(typoIngredient.approximate, true);
    assert.ok(typoIngredient.items.some((i) => i.name === 'Tachipirina'));
    const typoWords = await core.searchDrugs(adminCtx, 'cardioasprin 100');
    assert.deepEqual([typoWords.approximate, typoWords.items.map((i) => i.name)], [true, ['Cardioaspirin']]);
    assert.deepEqual(await core.searchDrugs(adminCtx, 'xyzqwk'), { catalogReady: true, approximate: false, items: [] });

    // Consultazione dell'elenco (tutti gli utenti): senza testo tutto in ordine alfabetico, con testo la stessa ricerca.
    const all = await core.listDrugCatalog(papaCtx, {});
    assert.deepEqual([all.page, all.hasMore, all.approximate], [1, false, false]);
    assert.deepEqual(all.items.map((i) => i.name), ['Anticopirina', 'Cardioaspirin', 'Paracetamolo Alfa', 'Tachipirina', 'Vecchiofarmaco', 'Zetadol']);
    assert.deepEqual(all.items.filter((i) => i.hasLeaflet).map((i) => i.name), ['Tachipirina'], 'foglietto solo dal sito AIFA');
    const found = await core.listDrugCatalog(papaCtx, { q: 'paracetamolo' });
    assert.deepEqual(found.items.map((i) => i.name), ['Tachipirina', 'Zetadol', 'Paracetamolo Alfa', 'Anticopirina', 'Vecchiofarmaco']);
    const fuzzy = await core.listDrugCatalog(papaCtx, { q: 'takipirina' });
    assert.deepEqual([fuzzy.approximate, fuzzy.items[0]!.name], [true, 'Tachipirina']);
    assert.deepEqual((await core.listDrugCatalog(papaCtx, { page: '2' })).items, [], 'oltre l’ultima pagina');
    assert.deepEqual((await core.listDrugCatalog(papaCtx, { q: 'takipirina', page: 2 })).items, []);
    await rejects(() => core.listDrugCatalog(anon(), {}), 401);
    await core.replaceDrugCatalog(rows);

    await rejects(() => core.searchDrugs(adminCtx, 'a'), 400);
    await rejects(() => core.searchDrugs(anon(), 'tachi'), 401);
    await rejects(() => core.getDrugCatalogStatus(papaCtx), 403);

    // Dosaggio: si ricava dalla descrizione della confezione (l'AIFA non lo dà come campo a sé).
    const strengths: [string, string | null][] = [
      ['"500 MG COMPRESSE" 20 COMPRESSE', '500 mg'],
      ['"1000 MG COMPRESSE RIVESTITE CON FILM" 16 COMPRESSE', '1000 mg'],
      ['"120 MG/5 ML SCIROPPO" FLACONE DA 120 ML', '120 mg/5 ml'],
      ['"BAMBINI 100 MG/ML GOCCE ORALI, SOLUZIONE" FLACONE 30 ML', '100 mg/ml'],
      ['"875 MG + 125 MG COMPRESSE RIVESTITE CON FILM" 12 COMPRESSE', '875 mg + 125 mg'],
      ['"875 MG/125 MG POLVERE" 12 BUSTINE', '875 mg/125 mg'],
      ['"0,5 MG COMPRESSE" 30 COMPRESSE', '0,5 mg'],
      ['"100.000 U.I./ML GOCCE ORALI" FLACONE 10 ML', '100.000 UI/ml'],
      ['"25 MICROGRAMMI/ORA CEROTTI TRANSDERMICI" 3 CEROTTI', '25 microgrammi/ora'],
      ['"1% GEL" TUBO DA 50 G', '1%'],
      ['5 MG - COMPRESSA RIVESTITA CON FILM - USO ORALE - BLISTER - 28 COMPRESSE', '5 mg'],
      ['100 MG COMPRESSE GASTRORESISTENTI; 30 CPR', '100 mg'],
      ['"SCIROPPO" FLACONE 200 ML', null],
      ['SCIROPPO FLACONE 200 ML', null],
      ['', null],
    ];
    for (const [description, expected] of strengths) assert.equal(core.drugStrength(description), expected, description);

    // Formulazioni e dosaggi del farmaco: solo confezioni autorizzate, senza doppioni, in ordine.
    assert.deepEqual(await core.getDrugOptions(papaCtx, '012745'), {
      aic: '012745',
      variants: [
        { form: 'Compressa', strength: '500 mg' },
        { form: 'Compressa', strength: '1000 mg' },
        { form: 'Sciroppo', strength: '120 mg/5 ml' },
      ],
    });
    // Farmaco non più in commercio: restano le sue confezioni; dosaggio non riconosciuto → la descrizione.
    assert.deepEqual((await core.getDrugOptions(papaCtx, '099999')).variants, [{ form: 'Gocce orali', strength: 'gocce 10 ml' }]);
    assert.deepEqual((await core.getDrugOptions(papaCtx, '000001')).variants, []);
    await rejects(() => core.getDrugOptions(papaCtx, '12'), 400);
    await rejects(() => core.getDrugOptions(anon(), '012745'), 401);

    // Il foglietto illustrativo compare nella terapia del farmaco scelto dall'elenco.
    const tachi = (await core.listMedications(adminCtx, patientB)).find((m) => m.name === 'Tachipirina');
    assert.equal(tachi?.leafletUrl, 'https://api.aifa.gov.it/x/12745?ts=FI');

    // Foglietto: dalla copia locale se recente (qui nessuna rete), mai da indirizzi che non sono dell'AIFA.
    assert.deepEqual(await core.getDrugInfo(papaCtx, '012745'), { aic: '012745', name: 'TACHIPIRINA', activeIngredient: 'PARACETAMOLO', holder: 'ACRAF S.P.A.', hasLeaflet: true });
    assert.equal((await core.getDrugInfo(papaCtx, '024840')).hasLeaflet, false);
    const fakePdf = makePdf([[{ x: 30, y: 700, text: 'Foglio illustrativo' }]]);
    mkdirSync(path.join(storageDir, 'leaflets'), { recursive: true });
    writeFileSync(path.join(storageDir, 'leaflets', '012745.pdf'), fakePdf);
    const leaflet = await core.getDrugLeaflet(papaCtx, '012745');
    assert.deepEqual(new Uint8Array(leaflet.data), fakePdf);
    assert.equal(leaflet.fileName, 'Foglietto illustrativo - TACHIPIRINA.pdf');
    await rejects(() => core.getDrugLeaflet(papaCtx, '024840'), 404);
    await rejects(() => core.getDrugLeaflet(papaCtx, '../../x'), 404);
    await rejects(() => core.getDrugLeaflet(anon(), '012745'), 401);
  });

  test('prestazioni della Regione Puglia: lettura dei file Excel, importazione e ricerca', async () => {
    assert.deepEqual(core.readXlsxSheets(makeXlsx([[['A & B', '', 'è <c>', 12.5]]], false)), [[['A & B', '', 'è <c>', '12.5']]]);
    assert.throws(() => core.readXlsxSheets(new TextEncoder().encode('non è un file excel, proprio no')), /Excel/);
    assert.equal(core.excelDate('45656')?.toISOString().slice(0, 10), '2024-12-30');
    assert.equal(core.excelDate('29/12/2024')?.toISOString().slice(0, 10), '2024-12-29');
    assert.equal(core.excelDate(''), null);

    // Stessa forma dei file pubblicati: un titolo sopra l'intestazione, intestazioni con a capo e spiegazioni.
    const header = [
      'Codice\r\nNomenclatore',
      'Denominazione Nomenclatore',
      'Codice Nomenclatore DPCM 2017',
      'Denominazione Nomenclatore DPCM 2017',
      'Denominazione Estesa Catalogo',
      'Denominazione Standard Catalogo\r\n(lunghezza fino a 100 caratteri)',
      'Denominazione Breve Catalogo\r\n(lunghezza fino a 75 caratteri)',
      'Codice Regionale Alfanumerico',
      'Codice Regionale Alfanumerico DPCM 2017',
      'Codice Regionale Numerico',
      'Attiva',
      'Data inizio validità',
      'Riferimenti inizio validità',
      'Data fine validità',
      'Riferimenti fine validità',
      'Note',
      'Compatibilità con tipo di accesso\r\n\r\nP = da non utilizzare per i controlli',
    ];
    const catalog = makeXlsx([
      [['Legenda'], ['una nota']],
      [
        ['CATALOGO DELLE PRESTAZIONI SPECIALISTICHE AMBULATORIALI DELLA REGIONE PUGLIA'],
        header,
        ['89.13', 'VISITA NEUROLOGICA', '89.13', 'PRIMA VISITA NEUROLOGICA [NEUROCHIRURGICA]', 'PRIMA VISITA NEUROLOGICA', 'PRIMA VISITA NEUROLOGICA', 'PRIMA VISITA NEUROLOGICA', '89.13.00.01', '89.13.00.01', 10241, 'S', 42461, 'DGR 1668/2015', '', '', '', 'P'],
        ['89.01', 'VISITA DI CONTROLLO', '89.01.C', 'VISITA NEUROLOGICA DI CONTROLLO', 'VISITA NEUROLOGICA DI CONTROLLO', '', '', '89.01.00.13', '89.01.C0.01', 10253, 'S', 42461, 'DGR 1668/2015', '', '', 'Prescrivibile da MMG', 'C'],
        ['PAC.16', 'VECCHIO PACCHETTO', '', '', 'MANAGEMENT DEL SANGUINAMENTO', '', '', 'PAC.16.00.01', '', 55261, 'S', 43313, 'DGR 1/2018', 45655, 'DPCM 2017', '', ''],
        ['', '', 'PAC.16', 'PACCHETTO', 'MANAGEMENT DEL SANGUINAMENTO', '', '', '', 'PAC.16.00.01', 55261, 'S', 45656, 'DPCM 2017', '', '', '', ''],
        ['', '', 'PAC.A0', 'DAY SERVICE', 'DSV ACCESSO PRIMA VISITA', '', '', '', 'PAC.A0.00.01', 55992, '', 46199, 'DGR 336/2026', '', '', '', ''],
        ['', '', '90.62.2', 'EMOCROMO', 'EMOCROMO: ESAME EMOCROMOCITOMETRICO', '', '', '', '90.62.2.01', 13891, 'S', 45656, 'DPCM 2017', '', '', '', ''],
        ['', '', '', '', 'RIGA SENZA CODICE', '', '', '', '', '', '', '', '', '', '', '', ''],
      ],
    ]);
    const tariffFile = makeXlsx([
      [
        ['CODICE', 'DESCRIZIONE', 'DATA_INIZIO', 'DATA_FINE', 'TARIFFA', 'CICLO_TERAPEUTICO', 'CODICE_BRANCA', 'DESCRIZIONE_BRANCA', 'TARIFFARIO'],
        ['     89.13', 'PRIMA VISITA NEUROLOGICA', 45656, '', 25, 'NO', 15, 'NEUROLOGIA', 'NAZIONALE DPCM2017'],
        ['     89.13', 'PRIMA VISITA NEUROLOGICA', 45656, '', 25, 'NO', 14, 'NEUROCHIRURGIA', 'NAZIONALE DPCM2017'],
        ['     89.01.C', 'VISITA NEUROLOGICA DI CONTROLLO', 45656, '', 17.900000000000002, 'NO', 15, 'NEUROLOGIA', 'NAZIONALE DPCM2017'],
        ['     90.62.2', 'EMOCROMO', 45656, '', 1.95, 'NO', 11, 'LABORATORIO', 'NAZIONALE DPCM2017'],
      ],
    ]);
    const tariffs = core.healthServiceTariffsFromXlsx(tariffFile);
    assert.deepEqual(tariffs.get('89.13'), { tariff: '25.00', therapeuticCycle: false, branches: ['NEUROLOGIA', 'NEUROCHIRURGIA'], tariffList: 'NAZIONALE DPCM2017' });
    const rows = core.healthServiceRowsFromXlsx(catalog, tariffs);
    assert.deepEqual(rows.map((r) => r.id), ['10241', '10253', '55261-c', '55261', '55992', '13891'], 'la voce cessata e quella nuova hanno lo stesso codice numerico');
    assert.equal(rows[1]!.tariff, '17.90');
    assert.equal(rows[2]!.validTo?.toISOString().slice(0, 10), '2024-12-29');
    assert.throws(() => core.healthServiceRowsFromXlsx(tariffFile), /Catalogo Unico Regionale/);
    assert.throws(() => core.healthServiceTariffsFromXlsx(makeXlsx([[['a', 'b']]])), /Nomenclatore/);

    assert.equal((await core.listHealthServices(papaCtx, {})).catalogReady, false);
    await core.replaceHealthServices(rows, { catalogSource: 'catalogo di prova.xlsx', tariffSource: 'tariffe di prova' });
    const status = await core.getHealthServiceCatalogStatus(adminCtx);
    assert.deepEqual([status.services, status.inForce, status.priced, status.catalogSource], [6, 5, 3, 'catalogo di prova.xlsx']);

    const ids = async (query: object) => (await core.listHealthServices(papaCtx, query)).items.map((i) => i.id);
    const all = await core.listHealthServices(papaCtx, {});
    assert.deepEqual(all.items.map((i) => i.id), ['10253', '10241', '13891', '55261', '55992'], 'in ordine di codice, senza le cessate');
    assert.deepEqual([all.total, all.branches], [5, ['LABORATORIO', 'NEUROCHIRURGIA', 'NEUROLOGIA']]);
    assert.equal((await ids({ ceased: 'include' })).at(-1), '55261-c', 'le cessate in fondo');
    assert.deepEqual(await ids({ ceased: 'only' }), ['55261-c'], 'solo le cessate');
    assert.deepEqual(await ids({ q: 'visita neurologica' }), ['10253', '10241']);
    assert.deepEqual(await ids({ q: '89.13' }), ['10241'], 'un codice non trova "13891"');
    assert.deepEqual(await ids({ q: '8913' }), ['10241'], 'codice scritto senza punti');
    assert.deepEqual(await ids({ q: '89130001' }), ['10241'], 'codice regionale alfanumerico senza punti');
    assert.deepEqual(await ids({ q: '9062' }), ['13891'], 'inizio di un codice senza punti');
    assert.deepEqual(await ids({ q: '3891' }), [], 'non un pezzo in mezzo a un codice');
    assert.deepEqual(await ids({ q: 'pac16', ceased: 'include' }), ['55261', '55261-c']);
    assert.deepEqual(await ids({ q: 'visita 8901c' }), ['10253'], 'nome e codice insieme');
    assert.deepEqual(await ids({ q: 'pac.16', ceased: 'include' }), ['55261', '55261-c']);
    assert.deepEqual(await ids({ q: '13891' }), ['13891'], 'codice regionale numerico');
    assert.deepEqual(await ids({ branch: 'NEUROCHIRURGIA' }), ['10241']);
    assert.deepEqual(await ids({ page: 2 }), []);
    // Ordinamenti: senza tariffa o senza branca sempre in fondo; a parità, per codice.
    assert.deepEqual(await ids({ sort: 'code', direction: 'desc' }), ['55992', '55261', '13891', '10241', '10253']);
    assert.deepEqual(await ids({ sort: 'name' }), ['55992', '13891', '55261', '10241', '10253']);
    assert.deepEqual(await ids({ sort: 'tariff' }), ['13891', '10253', '10241', '55261', '55992']);
    assert.deepEqual(await ids({ sort: 'tariff', direction: 'desc' }), ['10241', '10253', '13891', '55261', '55992']);
    assert.deepEqual(await ids({ sort: 'branch' }), ['13891', '10241', '10253', '55261', '55992']);
    assert.deepEqual(await ids({ sort: 'branch', direction: 'desc' }), ['10253', '10241', '13891', '55261', '55992']);
    assert.deepEqual((await core.getHealthService(papaCtx, '10241')).branches, ['NEUROCHIRURGIA', 'NEUROLOGIA'], 'branche in ordine alfabetico');
    await rejects(() => core.listHealthServices(papaCtx, { sort: 'altro' }), 400);

    const visit = await core.getHealthService(papaCtx, '10241');
    assert.deepEqual(
      [visit.code, visit.alphaCode, visit.oldCode, visit.tariff, visit.accessType, visit.validFrom, visit.validFromRef, visit.active],
      ['89.13', '89.13.00.01', '89.13', 25, 'P', '2016-04-01', 'DGR 1668/2015', true],
    );
    const pending = await core.getHealthService(papaCtx, '55992');
    assert.deepEqual([pending.active, pending.tariff, pending.branches, pending.name], [null, null, [], 'DSV ACCESSO PRIMA VISITA']);
    await rejects(() => core.getHealthService(papaCtx, '99999'), 404);
    await rejects(() => core.getHealthService(papaCtx, '../x'), 404);
    await rejects(() => core.getHealthService(anon(), '10241'), 401);
    await rejects(() => core.listHealthServices(anon(), {}), 401);
    await rejects(() => core.getHealthServiceCatalogStatus(papaCtx), 403);
    await rejects(() => core.importHealthServices(papaCtx), 403);
    await rejects(() => core.replaceHealthServices([], { catalogSource: 'x', tariffSource: null }), 422);

    const links = core.healthServiceFileLinks(
      '<a href="/documents/1/2/Catalogo+Unico+Regionale+delle+Prestazioni+-+aggiornato+26+giugno+2026%29.xlsx/9df4" target="_blank">' +
        '<a href="https://altro.example/documents/1/2/Catalogo+Unico+Regionale/x"><a href="/documents/1/3/Nomenclatore+Tariffario+Completo_22012025/2d47">',
    );
    assert.equal(links.catalog?.url, 'https://sist.sanita.puglia.it/documents/1/2/Catalogo+Unico+Regionale+delle+Prestazioni+-+aggiornato+26+giugno+2026%29.xlsx/9df4');
    assert.equal(links.catalog?.name, 'Catalogo Unico Regionale delle Prestazioni - aggiornato 26 giugno 2026).xlsx');
    assert.equal(links.tariffs?.name, 'Nomenclatore Tariffario Completo_22012025');
    assert.deepEqual(core.healthServiceFileLinks('<a href="/documents/1/2/altro.pdf/x">'), { catalog: null, tariffs: null });
  });

  test('andamento esami: stesso esame con nomi diversi, unità separate, urine a parte', async () => {
    const lab = (examDate: string, results: { name: string; value: string; unit?: string; referenceRange?: string; section?: string }[]) =>
      core.createReport(adminCtx, patientB, { kind: 'LABORATORIO', title: 'Esami del sangue', examDate, results });
    await lab('2024-05-02', [
      { name: 'HGB', value: '11,2', unit: 'g/dL', referenceRange: '12,0 - 16,0' },
      { name: 'Glicemia', value: '5,4', unit: 'mmol/L' },
    ]);
    await lab('2023-01-15', [
      { name: 'Emoglobina (Hb)', value: '13,8', unit: 'g/dl', referenceRange: '12,0 - 16,0' },
      { name: 'Glucosio', value: '98', unit: 'mg/dL', referenceRange: '70 - 110' },
      { name: 'Leucociti', value: 'assenti', section: 'Esame urine' },
      { name: 'Esame strano', value: '3' },
    ]);
    const reader = await ctxFromToken((await core.login(anon('10.0.0.10'), { email: 'lettore@test.it', password: 'nuovapassword1' }, 'web')).token);
    const trends = await core.listLabTrends(reader, patientB);
    const hb = trends.find((t) => t.key === 'emoglobina')!;
    assert.deepEqual(hb.points.map((p) => [p.date, p.numericValue, p.outOfRange]), [['2023-01-15', 13.8, false], ['2024-05-02', 11.2, true]], 'in ordine di data');
    assert.equal(hb.label, 'Emoglobina');
    const glu = trends.filter((t) => t.key === 'glucosio');
    assert.equal(glu.length, 2, 'unità diverse = andamenti distinti');
    assert.ok(trends.some((t) => t.key === 'urine-leucociti' && t.category === 'Urine'));
    assert.ok(!trends.some((t) => t.key === 'globuli-bianchi'), 'i leucociti delle urine non sono i globuli bianchi');
    assert.ok(trends.some((t) => t.key === 'esame-strano' && !t.known && t.label === 'Esame strano'));

    assert.equal((await core.getLabTrend(reader, patientB, 'glucosio')).length, 2);
    await rejects(() => core.getLabTrend(reader, patientB, '../x'), 404);
    await rejects(() => core.getLabTrend(reader, patientB, 'inesistente'), 404);
    await rejects(() => core.listLabTrends(reader, patientA), 404);
    const log = await core.listAudit(adminCtx, { action: 'lab.' });
    assert.ok(log.items.length >= 1 && !/gluc|emoglob/i.test(JSON.stringify(log.items.map((i) => i.details))));
  });

  test('referti: data del prelievo salvata, modificata e validata', async () => {
    const r = await core.createReport(adminCtx, patientB, { kind: 'LABORATORIO', title: 'Prelievo', examDate: '2025-05-03', samplingDate: '2025-05-02', results: [] });
    assert.equal(r.samplingDate, '2025-05-02');
    const u = await core.updateReport(adminCtx, r.id, { kind: 'LABORATORIO', title: 'Prelievo', examDate: '2025-05-03', samplingDate: '' });
    assert.equal(u.samplingDate, null);
    await rejects(() => core.updateReport(adminCtx, r.id, { kind: 'LABORATORIO', title: 'X', examDate: '2025-05-03', samplingDate: '2999-01-01' }), 400);
    await core.deleteReport(adminCtx, r.id);
  });

  test('impostazioni del server: solo amministratori, validazione, durata delle sessioni', async () => {
    const reader = await ctxFromToken((await core.login(anon('10.0.0.11'), { email: 'lettore@test.it', password: 'nuovapassword1' }, 'web')).token);
    for (const fn of [core.getServerSettings, core.getServerStatus, core.getStorageUsage, core.revokeAllSessions, core.runMaintenanceNow]) {
      await rejects(() => fn(reader), 403);
      await rejects(() => fn(anon()), 401);
    }
    await rejects(() => core.updateServerSettings(reader, { sessionIdleDays: 1 }), 403);

    const before = await core.getServerSettings(adminCtx);
    assert.deepEqual(before.values, before.defaults, 'senza modifiche valgono i predefiniti');
    assert.equal(before.values.auditRetentionMonths, 0);

    await rejects(() => core.updateServerSettings(adminCtx, { sessionIdleDays: 0 }), 400);
    await rejects(() => core.updateServerSettings(adminCtx, { sessionMaxDays: 'tanti' }), 400);
    await rejects(() => core.updateServerSettings(adminCtx, { auditRetentionMonths: -1 }), 400);
    await rejects(() => core.updateServerSettings(adminCtx, { sessionIdleDays: 20, sessionMaxDays: 10 }), 400);
    await rejects(() => core.updateServerSettings(adminCtx, { sessionMaxDays: before.values.sessionIdleDays - 1 }), 400);

    const saved = await core.updateServerSettings(adminCtx, { sessionIdleDays: '2', sessionMaxDays: 5 });
    assert.deepEqual([saved.sessionIdleDays, saved.sessionMaxDays, saved.auditRetentionMonths], [2, 5, 0]);
    assert.deepEqual((await core.getServerSettings(adminCtx)).values, saved);

    // Una nuova sessione scade dopo 2 giorni di inattività…
    const fresh = await core.login(anon('10.0.0.12'), { email: 'lettore@test.it', password: 'nuovapassword1' }, 'web');
    const days = (fresh.expiresAt.getTime() - Date.now()) / 86_400_000;
    assert.ok(days > 1.99 && days <= 2, `scadenza a ${days} giorni`);
    // …e una più vecchia della durata massima non vale più.
    const fresh2 = await ctxFromToken(fresh.token);
    await prisma.session.update({ where: { id: fresh2.sessionId! }, data: { createdAt: new Date(Date.now() - 6 * 86_400_000) } });
    assert.equal(await core.resolveSession(fresh.token), null);

    const log = await core.listAudit(adminCtx, { action: 'server.settings_updated' });
    assert.equal(log.items.length, 1);
    assert.deepEqual(log.items[0]!.details, { changed: { sessionIdleDays: 2, sessionMaxDays: 5 } });
    // Salvare gli stessi valori non scrive nulla.
    await core.updateServerSettings(adminCtx, { sessionIdleDays: 2 });
    assert.equal((await core.listAudit(adminCtx, { action: 'server.settings_updated' })).total, 1);

    await core.updateServerSettings(adminCtx, before.defaults);
    assert.deepEqual((await core.getServerSettings(adminCtx)).values, before.defaults);
  });

  test('impostazioni del server: disconnessione di tutti, pulizia e stato', async () => {
    const other = await core.login(anon('10.0.0.13'), { email: 'lettore@test.it', password: 'nuovapassword1' }, 'web');
    assert.ok(await core.resolveSession(other.token));
    const closed = await core.revokeAllSessions(adminCtx);
    assert.ok(closed >= 1);
    assert.equal(await core.resolveSession(other.token), null, 'gli altri sono disconnessi');
    assert.equal(await prisma.session.count(), 1, 'resta solo la sessione di chi lo ha chiesto');
    assert.equal((await prisma.session.findFirstOrThrow()).id, adminCtx.sessionId);

    // Pulizia: sessioni scadute e voci del registro oltre il periodo di conservazione.
    const expired = await core.login(anon('10.0.0.14'), { email: 'lettore@test.it', password: 'nuovapassword1' }, 'web');
    await prisma.session.updateMany({ where: { id: { not: adminCtx.sessionId! } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const old = await prisma.auditLog.create({ data: { action: 'auth.login', createdAt: new Date(Date.now() - 400 * 86_400_000) } });
    const entries = await prisma.auditLog.count();

    assert.deepEqual(await core.runMaintenanceNow(adminCtx), { expiredSessions: 1, auditEntries: 0 }, 'con 0 mesi il registro non si tocca');
    assert.equal(await core.resolveSession(expired.token), null);
    assert.equal(await prisma.auditLog.count(), entries);

    await core.updateServerSettings(adminCtx, { auditRetentionMonths: 12 });
    assert.deepEqual(await core.runMaintenanceNow(adminCtx), { expiredSessions: 0, auditEntries: 1 });
    assert.equal(await prisma.auditLog.findUnique({ where: { id: old.id } }), null);
    const purge = await core.listAudit(adminCtx, { action: 'server.audit_purged' });
    assert.deepEqual(purge.items[0]!.details, { entries: 1, retentionMonths: 12 });
    assert.equal(purge.items[0]!.userId, adminCtx.user!.id);
    await core.updateServerSettings(adminCtx, { auditRetentionMonths: 0 });

    const status = await core.getServerStatus(adminCtx);
    assert.equal(status.activeSessions, 1);
    assert.ok(status.databaseBytes > 0 && status.users >= 1 && status.auditEntries > 0);
    assert.equal(status.storageDir, storageDir);
    const usage = await core.getStorageUsage(adminCtx);
    assert.ok(usage.files > 0 && usage.bytes > 0, 'conta i file DICOM dei test');
    assert.ok(usage.diskFreeBytes! > 0 && usage.diskTotalBytes! >= usage.diskFreeBytes!);
  });

  test('blocco accessi: non amministratori sospesi senza perdere il login', async () => {
    const lettore = { email: 'lettore@test.it', password: 'nuovapassword1' };
    const other = await core.login(anon('10.0.0.15'), lettore, 'web');
    await rejects(async () => core.setLockdown(await ctxFromToken(other.token), true), 403);
    await rejects(() => core.getLockdownStatus(anon()), 401);
    assert.equal(await core.getLockdownStatus(adminCtx), null);

    const on = await core.setLockdown(adminCtx, true);
    assert.equal(on?.byName, adminCtx.user!.displayName);
    assert.deepEqual(await core.setLockdown(adminCtx, true), on, 'riattivarlo non cambia nulla');
    assert.deepEqual(await core.getLockdownStatus(adminCtx), on);

    // La sessione del non amministratore è sospesa, non chiusa.
    assert.deepEqual(await core.lookupSession(other.token), { status: 'suspended' });
    assert.equal(await core.resolveSession(other.token), null);
    assert.equal(await prisma.session.count({ where: { user: { email: lettore.email } } }), 1, 'la sessione resta nel database');

    // Login: rifiutato ai non amministratori solo con la password giusta, consentito agli amministratori.
    await rejects(() => core.login(anon('10.0.0.16'), lettore, 'web'), 503, 'LOCKDOWN');
    await rejects(() => core.login(anon('10.0.0.16'), { ...lettore, password: 'sbagliata' }, 'web'), 401, 'INVALID_CREDENTIALS');
    const admin = await core.login(anon('10.0.0.16'), { email: 'admin@test.it', password: 'passwordlunga1' }, 'web');
    assert.equal((await core.lookupSession(admin.token)).status, 'active');
    assert.ok(await core.resolveSession(admin.token));

    assert.equal(await core.setLockdown(adminCtx, false), null);
    const resumed = await core.lookupSession(other.token);
    assert.equal(resumed.status, 'active', 'allo sblocco la sessione riprende');
    assert.ok(await core.login(anon('10.0.0.16'), lettore, 'web'));

    const actions = (await core.listAudit(adminCtx, { action: 'server.lockdown' })).items.map((i) => i.action);
    assert.deepEqual(actions.sort(), ['server.lockdown_disabled', 'server.lockdown_enabled']);
    const failed = (await core.listAudit(adminCtx, { action: 'auth.login_failed', pageSize: 100 })).items;
    assert.ok(failed.some((i) => (i.details as { reason?: string } | null)?.reason === 'blocco accessi'));
  });

  test('manutenzione: non amministratori in sola lettura, avviso facoltativo', async () => {
    const papa = papaCtx as import('../src/context').AuthedContext;
    await rejects(() => core.setMaintenanceMode(papaCtx, { active: true }), 403);
    await rejects(() => core.getMaintenanceStatus(anon()), 401);
    assert.equal(await core.getMaintenanceStatus(papaCtx), null);
    await rejects(() => core.setMaintenanceMode(adminCtx, { active: true, message: 'x'.repeat(201) }), 400);
    assert.equal(await core.getPatientPermission(papa, patientA), 'edit', 'prima della manutenzione può modificare');

    const on = await core.setMaintenanceMode(adminCtx, { active: true, message: '  fino alle 18:00 ' });
    assert.equal(on?.message, 'fino alle 18:00');
    assert.equal(on?.byName, adminCtx.user!.displayName);
    assert.deepEqual(await core.getMaintenanceStatus(papaCtx), { ...on, byName: null }, 'chi l’ha attivata lo vedono solo gli amministratori');

    // Chi non è amministratore consulta ma non modifica, con un errore chiaro.
    assert.equal(await core.getPatientPermission(papa, patientA), 'view');
    assert.equal((await core.getPatient(papaCtx, patientA)).canEdit, false);
    assert.equal((await core.listPatients(papaCtx))[0]!.canEdit, false);
    await rejects(() => core.updatePatient(papaCtx, patientA, { firstName: 'M', lastName: 'R' }), 503, 'MAINTENANCE');
    await rejects(() => core.createMedication(papaCtx, patientA, {}), 503, 'MAINTENANCE');
    // Chi aveva già la sola lettura riceve il solito errore; gli amministratori modificano.
    const lettore = await ctxFromToken((await core.login(anon('10.0.0.17'), { email: 'lettore@test.it', password: 'nuovapassword1' }, 'web')).token);
    await rejects(() => core.updatePatient(lettore, patientB, { firstName: 'M', lastName: 'R' }), 403, 'FORBIDDEN');
    assert.equal((await core.getPatient(adminCtx, patientA)).canEdit, true);
    assert.equal((await core.listPatients(adminCtx)).every((p) => p.canEdit), true);

    // L'avviso si può cambiare senza spostare l'inizio.
    const changed = await core.setMaintenanceMode(adminCtx, { active: true, message: '' });
    assert.equal(changed?.message, null);
    assert.equal(changed?.since, on!.since);

    assert.equal(await core.setMaintenanceMode(adminCtx, { active: false }), null);
    assert.equal(await core.getMaintenanceStatus(papaCtx), null);
    assert.equal(await core.getPatientPermission(papa, patientA), 'edit');

    const log = await core.listAudit(adminCtx, { action: 'server.maintenance', pageSize: 100 });
    assert.deepEqual(log.items.map((i) => i.action).sort(), ['server.maintenance_disabled', 'server.maintenance_enabled', 'server.maintenance_enabled']);
    assert.ok(!JSON.stringify(log.items.map((i) => i.details)).includes('18:00'), 'il testo dell’avviso non finisce nel registro');
  });

  test('piano terapeutico: tipo e campo scelti nelle impostazioni, vale quello che scade per ultimo', async () => {
    await rejects(() => core.getTherapyPlan(anon(), patientB), 401);
    await rejects(() => core.getTherapyPlan(papaCtx, patientB), 404);
    assert.deepEqual(await core.getTherapyPlan(adminCtx, patientB), { configured: false, report: null });

    const t = await core.createReportTemplate(adminCtx, {
      name: 'Piano terapeutico',
      fields: [
        { key: 'c_scadenza', type: 'date', label: 'Scadenza' },
        { key: 'c_farmaco', type: 'text_input', label: 'Farmaco' },
      ],
    });
    // Il tipo deve esistere e il campo essere una sua data.
    await rejects(() => core.updateServerSettings(papaCtx, { therapyPlanTemplateId: t.id, therapyPlanDateField: 'c_scadenza' }), 403);
    await rejects(() => core.updateServerSettings(adminCtx, { therapyPlanTemplateId: t.id }), 400);
    await rejects(() => core.updateServerSettings(adminCtx, { therapyPlanTemplateId: t.id, therapyPlanDateField: 'c_farmaco' }), 400);
    await rejects(() => core.updateServerSettings(adminCtx, { therapyPlanTemplateId: '00000000-0000-4000-8000-00000000ffff', therapyPlanDateField: 'examDate' }), 400);
    await core.updateServerSettings(adminCtx, { therapyPlanTemplateId: t.id, therapyPlanDateField: 'c_scadenza' });

    assert.deepEqual(await core.getTherapyPlan(adminCtx, patientB), { configured: true, report: null }, 'nessun piano registrato');

    const old = await core.createReport(adminCtx, patientB, { templateId: t.id, title: 'Piano 2025', examDate: '2025-01-10', custom: { c_scadenza: '2025-07-10' } });
    const renewed = await core.createReport(adminCtx, patientB, { templateId: t.id, title: 'Rinnovo', examDate: '2024-12-01', custom: { c_scadenza: '2026-01-10' } });
    await core.createReport(adminCtx, patientB, { templateId: t.id, title: 'Senza scadenza', examDate: '2025-03-01' });
    const other = (await core.listReportTemplates(adminCtx)).find((x) => x.name === 'Referto descrittivo')!;
    await core.createReport(adminCtx, patientB, { templateId: other.id, title: 'Altro tipo', examDate: '2025-04-01', body: 'x' });
    assert.deepEqual((await core.getTherapyPlan(adminCtx, patientB)).report, { id: renewed.id, title: 'Rinnovo', examDate: '2024-12-01', expiresOn: '2026-01-10' });

    // Con la data dell'esame come scadenza vale il più recente.
    await core.updateServerSettings(adminCtx, { therapyPlanDateField: 'examDate' });
    assert.equal((await core.getTherapyPlan(adminCtx, patientB)).report?.title, 'Senza scadenza');
    await core.updateServerSettings(adminCtx, { therapyPlanDateField: 'c_scadenza' });
    assert.equal((await core.getTherapyPlan(adminCtx, patientB)).report?.id, renewed.id);
    await core.deleteReport(adminCtx, renewed.id);
    assert.equal((await core.getTherapyPlan(adminCtx, patientB)).report?.id, old.id);

    // Togliendo il tipo si toglie anche il campo.
    const off = await core.updateServerSettings(adminCtx, { therapyPlanTemplateId: null });
    assert.deepEqual([off.therapyPlanTemplateId, off.therapyPlanDateField], [null, null]);
    assert.deepEqual(await core.getTherapyPlan(adminCtx, patientB), { configured: false, report: null });
  });

  test('eliminazione paziente: rimuove anche gli accessi collegati', async () => {
    assert.ok(existsSync(path.join(storageDir, 'dicom', patientA)));
    await core.deletePatient(adminCtx, patientA);
    assert.ok(!existsSync(path.join(storageDir, 'dicom', patientA)), 'immagini del paziente eliminate');
    await rejects(() => core.getPatient(adminCtx, patientA), 404);
    const users = await core.listUsers(adminCtx);
    assert.equal(users.find((u) => u.id === papaId)!.access.length, 0);
  });
});
