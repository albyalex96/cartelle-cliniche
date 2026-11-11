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
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
await prisma.$executeRawUnsafe('TRUNCATE users, sessions, patients, patient_access, audit_logs, files, reports, lab_results, imaging_studies, imaging_series, imaging_instances CASCADE');

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

  test('eliminazione paziente: rimuove anche gli accessi collegati', async () => {
    assert.ok(existsSync(path.join(storageDir, 'dicom', patientA)));
    await core.deletePatient(adminCtx, patientA);
    assert.ok(!existsSync(path.join(storageDir, 'dicom', patientA)), 'immagini del paziente eliminate');
    await rejects(() => core.getPatient(adminCtx, patientA), 404);
    const users = await core.listUsers(adminCtx);
    assert.equal(users.find((u) => u.id === papaId)!.access.length, 0);
  });
});
