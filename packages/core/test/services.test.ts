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
await prisma.$executeRawUnsafe('TRUNCATE users, sessions, patients, patient_access, audit_logs, files, reports, lab_results, imaging_studies, imaging_series, imaging_instances, medications, drug_packages CASCADE');

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
    assert.equal(draft.values.kind, 'DESCRITTIVO');
    assert.equal(draft.values.title, 'RM GINOCCHIO DESTRO');
    assert.equal(draft.values.examDate, '2024-03-14');
    assert.equal(draft.values.doctor, 'Dott. Amedeo Filani');

    const created = await core.createReport(adminCtx, patientA, draft.values, { fileId: up.file.id, parser: draft.parser });
    assert.equal(created.parserId, 'generico');
    assert.equal(created.file?.id, up.file.id);
    assert.equal((await core.uploadReportPdf(adminCtx, patientA, { fileName: 'x.pdf', bytes: pdf })).existingReportId, created.id);
    await rejects(() => core.prepareReportDraft(adminCtx, patientA, up.file.id), 409, 'ALREADY_IMPORTED');
    await rejects(() => core.createReport(adminCtx, patientA, draft.values, { fileId: up.file.id }), 409, 'ALREADY_IMPORTED');
    await rejects(() => core.discardReportPdf(adminCtx, up.file.id), 409, 'FILE_IN_USE');

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

    const updated = await core.updateReport(adminCtx, lab.id, { kind: 'LABORATORIO', title: 'Esami del sangue', examDate: '2025-05-02', results: [{ name: 'Ferritina', value: '45' }] });
    assert.deepEqual(updated.results.map((r) => r.name), ['Ferritina']);

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

    // Eliminazione dello studio: spariscono anche i file.
    const studyDir = path.join(storageDir, 'dicom', patientA, study!.id);
    assert.ok(existsSync(studyDir));
    await core.deleteImagingStudy(adminCtx, study!.id);
    assert.ok(!existsSync(studyDir), 'cartella dello studio eliminata');
    assert.deepEqual(await core.listImagingStudies(adminCtx, patientA), []);

    // Di nuovo, per verificare che l'eliminazione del paziente cancelli i file (test successivo).
    await core.uploadDicomFiles(adminCtx, patientA, [{ name: 'IM1', bytes: im1 }]);
    const log = await core.listAudit(adminCtx, { action: 'imaging.' });
    assert.ok(log.items.some((i) => i.action === 'imaging.uploaded') && log.items.some((i) => i.action === 'imaging.study_deleted'));
    assert.ok(!/ginocchio|angelo/i.test(JSON.stringify(log.items.map((i) => i.details))), 'nessun dato sanitario nel registro');
  });

  test('terapie: inserimento, conclusione, ordine, permessi', async () => {
    const reader = await ctxFromToken((await core.login(anon('10.0.0.9'), { email: 'lettore@test.it', password: 'nuovapassword1' }, 'web')).token);
    const a = await core.createMedication(adminCtx, patientB, {
      name: 'Cardioaspirin 100 mg',
      activeIngredient: 'Acido acetilsalicilico',
      dosage: '1 compressa',
      frequency: 'a pranzo',
      startDate: '2024-01-10',
    });
    assert.equal(a.active, true);
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
    ].join('\r\n');
    const rows = core.drugRowsFromCsv(core.decodeCsv(new TextEncoder().encode(csv)));
    assert.equal(rows.length, 4);
    assert.equal(rows[2]!.package, '100 MG COMPRESSE GASTRORESISTENTI; 30 CPR', 'separatore dentro le virgolette');
    assert.equal(rows[2]!.leafletUrl, null, 'solo link https');
    assert.equal(rows[3]!.package, '"GOCCE" 10 ML');
    assert.throws(() => core.drugRowsFromCsv('a;b\n1;2'), /AIFA/);

    // Prima dell'importazione la ricerca avvisa che l'elenco manca.
    assert.deepEqual(await core.searchDrugs(adminCtx, 'tachi'), { catalogReady: false, items: [] });
    await core.replaceDrugCatalog(rows);
    const status = await core.getDrugCatalogStatus(adminCtx);
    assert.deepEqual([status.packages, status.products], [4, 3]);

    const byName = await core.searchDrugs(adminCtx, 'Tachipirina');
    assert.equal(byName.items.length, 1);
    assert.deepEqual([byName.items[0]!.aic, byName.items[0]!.name, byName.items[0]!.activeIngredient], ['012745', 'Tachipirina', 'Paracetamolo']);
    assert.equal(byName.items[0]!.packages.length, 2);
    const byIngredient = await core.searchDrugs(adminCtx, 'paracetamolo');
    assert.deepEqual(byIngredient.items.map((i) => [i.name, i.withdrawn]), [['Tachipirina', false], ['Vecchiofarmaco', true]]);
    assert.equal((await core.searchDrugs(adminCtx, 'tachipirina 1000')).items[0]!.packages.length, 1, 'più parole');
    await rejects(() => core.searchDrugs(adminCtx, 'a'), 400);
    await rejects(() => core.searchDrugs(anon(), 'tachi'), 401);
    await rejects(() => core.getDrugCatalogStatus(papaCtx), 403);

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

  test('eliminazione paziente: rimuove anche gli accessi collegati', async () => {
    assert.ok(existsSync(path.join(storageDir, 'dicom', patientA)));
    await core.deletePatient(adminCtx, patientA);
    assert.ok(!existsSync(path.join(storageDir, 'dicom', patientA)), 'immagini del paziente eliminate');
    await rejects(() => core.getPatient(adminCtx, patientA), 404);
    const users = await core.listUsers(adminCtx);
    assert.equal(users.find((u) => u.id === papaId)!.access.length, 0);
  });
});
