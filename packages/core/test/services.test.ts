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
await prisma.$executeRawUnsafe('TRUNCATE users, sessions, patients, patient_access, audit_logs CASCADE');

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

  test('eliminazione paziente: rimuove anche gli accessi collegati', async () => {
    await core.deletePatient(adminCtx, patientA);
    await rejects(() => core.getPatient(adminCtx, patientA), 404);
    const users = await core.listUsers(adminCtx);
    assert.equal(users.find((u) => u.id === papaId)!.access.length, 0);
  });
});
