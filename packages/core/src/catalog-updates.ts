import { AUTO_UPDATE_CATALOGS, catalogSettingKeys, type AutoUpdateCatalog, type CatalogAutoUpdateDTO } from '@alby/shared';
import { catalogRunning, withCatalogLock } from './catalog-lock';
import { getPrisma, Prisma } from './db';
import { AppError } from './errors';
import { decodeCsv, downloadDrugCatalog, drugRowsFromCsv, replaceDrugCatalog } from './services/drug-catalog';
import { downloadHealthServices, replaceHealthServices } from './services/health-services';
import { getSettings } from './settings';

/**
 * Aggiornamento automatico degli elenchi pubblici (farmaci AIFA, prestazioni della Regione Puglia).
 * Si attiva e si programma dalle impostazioni: ogni N giorni dall'ultimo aggiornamento, all'ora scelta
 * (ora del server). Un controllo ogni pochi minuti, avviato con il server (`instrumentation.ts`), fa
 * partire quelli dovuti; se il server era spento all'ora prevista, l'aggiornamento parte appena possibile.
 * Se un tentativo non riesce si riprova il giorno dopo, alla stessa ora.
 */

const CHECK_EVERY_MS = 5 * 60_000;

interface Attempt {
  at: string;
  error: string | null;
}

const CATALOGS: Record<
  AutoUpdateCatalog,
  { importedAt: () => Promise<Date | null>; run: () => Promise<Record<string, number>>; auditPrefix: string; entity: string }
> = {
  drugs: {
    // Tutte le confezioni hanno la stessa data: l'elenco si sostituisce per intero.
    importedAt: async () => (await getPrisma().drugPackage.findFirst({ select: { importedAt: true } }))?.importedAt ?? null,
    run: async () => ({ packages: await replaceDrugCatalog(drugRowsFromCsv(decodeCsv(await downloadDrugCatalog()))) }),
    auditPrefix: 'drugs',
    entity: 'drug_catalog',
  },
  services: {
    importedAt: async () => {
      const prisma = getPrisma();
      const [any, source] = await Promise.all([
        prisma.healthService.findFirst({ select: { id: true } }),
        prisma.healthServiceImport.findUnique({ where: { id: 1 }, select: { importedAt: true } }),
      ]);
      return any ? (source?.importedAt ?? null) : null;
    },
    run: async () => {
      const { rows, sources } = await downloadHealthServices();
      return { services: await replaceHealthServices(rows, sources) };
    },
    auditPrefix: 'healthServices',
    entity: 'health_service_catalog',
  },
};

// L'ultimo tentativo automatico sta nella tabella delle impostazioni, accanto a quelle dell'elenco.
const attemptKey = (catalog: AutoUpdateCatalog) => `autoUpdateAttempt.${catalog}`;

async function readAttempt(catalog: AutoUpdateCatalog): Promise<Attempt | null> {
  const row = await getPrisma().setting.findUnique({ where: { key: attemptKey(catalog) } });
  const value = row?.value as Partial<Attempt> | null | undefined;
  return value && typeof value.at === 'string' ? { at: value.at, error: typeof value.error === 'string' ? value.error : null } : null;
}

async function saveAttempt(catalog: AutoUpdateCatalog, attempt: Attempt) {
  const value = attempt as unknown as Prisma.InputJsonValue;
  await getPrisma().setting.upsert({ where: { key: attemptKey(catalog) }, create: { key: attemptKey(catalog), value }, update: { value } });
}

/** Il giorno di `date` più `addDays` giorni, all'ora `hour` (ora del server). */
function dayAtHour(date: Date, addDays: number, hour: number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + addDays);
  d.setHours(hour);
  return d;
}

/**
 * Quando è dovuto il prossimo aggiornamento automatico: `days` giorni dopo l'ultimo riuscito, all'ora `hour`.
 * Mai scaricato: oggi a quell'ora (se è già passata, subito). Tentativo fallito: il giorno dopo, alla stessa ora.
 */
export function nextAutoUpdateAt(o: { days: number; hour: number; importedAt: Date | null; lastAttempt: Attempt | null; now: Date }): Date {
  let next = o.importedAt ? dayAtHour(o.importedAt, o.days, o.hour) : dayAtHour(o.now, 0, o.hour);
  if (o.lastAttempt?.error) {
    const failedAt = new Date(o.lastAttempt.at);
    if (failedAt >= next) next = dayAtHour(failedAt, 1, o.hour);
  }
  return next;
}

/** Programmazione e stato dell'aggiornamento automatico di un elenco (i permessi li controlla il servizio). */
export async function catalogAutoUpdateStatus(catalog: AutoUpdateCatalog, now = new Date()): Promise<CatalogAutoUpdateDTO> {
  const keys = catalogSettingKeys(catalog);
  const [settings, importedAt, lastAttempt] = await Promise.all([getSettings(), CATALOGS[catalog].importedAt(), readAttempt(catalog)]);
  const enabled = settings[keys.enabled];
  const days = settings[keys.days];
  const hour = settings[keys.hour];
  return {
    enabled,
    days,
    hour,
    importedAt: importedAt?.toISOString() ?? null,
    lastAttemptAt: lastAttempt?.at ?? null,
    lastError: lastAttempt?.error ?? null,
    nextRunAt: enabled ? nextAutoUpdateAt({ days, hour, importedAt, lastAttempt, now }).toISOString() : null,
    running: catalogRunning(catalog),
  };
}

/** Scarica e sostituisce l'elenco; l'esito resta nel registro (solo numeri, nessun dato dei pazienti). */
async function runAutoUpdate(catalog: AutoUpdateCatalog) {
  const { run, auditPrefix, entity } = CATALOGS[catalog];
  const at = new Date().toISOString();
  let action: string;
  let details: Record<string, unknown>;
  try {
    details = { ...(await withCatalogLock(catalog, run)), automatic: true };
    action = `${auditPrefix}.catalog_imported`;
    await saveAttempt(catalog, { at, error: null });
  } catch (err) {
    const error = err instanceof AppError ? err.message : 'Aggiornamento non riuscito';
    console.error(`[aggiornamento automatico] ${catalog}: non riuscito`, err);
    details = { error };
    action = `${auditPrefix}.catalog_auto_update_failed`;
    await saveAttempt(catalog, { at, error });
  }
  await getPrisma().auditLog.create({ data: { action, entity, details: details as Prisma.InputJsonValue } });
}

/** Avvia gli aggiornamenti dovuti, uno dopo l'altro (sono file grandi: meglio non scaricarli insieme). */
export async function catalogUpdateTick(now = new Date()) {
  for (const catalog of AUTO_UPDATE_CATALOGS) {
    const status = await catalogAutoUpdateStatus(catalog, now);
    if (!status.enabled || status.running || !status.nextRunAt || new Date(status.nextRunAt) > now) continue;
    await runAutoUpdate(catalog);
  }
}

const state = globalThis as unknown as { __albyCatalogTimer?: NodeJS.Timeout; __albyCatalogTickBusy?: boolean };

/** Da chiamare una volta all'avvio del server. Le chiamate successive non fanno nulla. */
export function startCatalogUpdateScheduler() {
  if (state.__albyCatalogTimer) return;
  const tick = () => {
    if (state.__albyCatalogTickBusy) return;
    state.__albyCatalogTickBusy = true;
    catalogUpdateTick()
      .catch((err) => console.error('[aggiornamento automatico] controllo non riuscito', err))
      .finally(() => (state.__albyCatalogTickBusy = false));
  };
  state.__albyCatalogTimer = setInterval(tick, CHECK_EVERY_MS);
  state.__albyCatalogTimer.unref();
  // Primo controllo poco dopo l'avvio, senza rallentarlo.
  setTimeout(tick, 60_000).unref();
}
