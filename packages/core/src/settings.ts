import { serverSettingsSchema, type ServerSettings } from '@alby/shared';
import { getConfig } from './config';
import { getPrisma, Prisma } from './db';

/**
 * Impostazioni del server modificabili dagli amministratori (tabella `settings`, una riga per voce).
 * Qui solo lettura e scrittura dei valori: i controlli dei permessi stanno in `services/settings.ts`.
 * Le voci mai modificate valgono il valore predefinito (per le sessioni: quello del file .env).
 */

/** Le impostazioni servono a ogni richiesta (durata delle sessioni): si rileggono al massimo ogni 10 secondi. */
const CACHE_MS = 10_000;

// In sviluppo Next.js ricarica i moduli: la copia in memoria resta la stessa.
const store = globalThis as unknown as { __albySettings?: { at: number; value: ServerSettings } };

export function defaultSettings(): ServerSettings {
  const cfg = getConfig();
  return {
    sessionIdleDays: cfg.SESSION_IDLE_DAYS,
    sessionMaxDays: cfg.SESSION_MAX_DAYS,
    auditRetentionMonths: 0,
    // Aggiornamento automatico degli elenchi pubblici: spento finché l'amministratore non lo attiva.
    drugsAutoUpdate: false,
    drugsUpdateDays: 7,
    drugsUpdateHour: 3,
    servicesAutoUpdate: false,
    servicesUpdateDays: 30,
    servicesUpdateHour: 3,
    // Piano terapeutico nella panoramica del paziente: nessun tipo di referto finché l'amministratore non lo sceglie.
    therapyPlanTemplateId: null,
    therapyPlanDateField: null,
  };
}

export async function getSettings(): Promise<ServerSettings> {
  const cached = store.__albySettings;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const value: ServerSettings = defaultSettings();
  const saved = new Map((await getPrisma().setting.findMany()).map((row) => [row.key, row.value]));
  for (const key of Object.keys(value) as (keyof ServerSettings)[]) {
    if (!saved.has(key)) continue;
    // Un valore salvato non più valido (es. limiti cambiati) viene ignorato: vale il predefinito.
    const parsed = serverSettingsSchema.shape[key].safeParse(saved.get(key));
    if (parsed.success) (value as Record<keyof ServerSettings, unknown>)[key] = parsed.data;
  }
  store.__albySettings = { at: Date.now(), value };
  return value;
}

/** Dopo un ripristino del database le impostazioni si rileggono subito. */
export function clearSettingsCache() {
  store.__albySettings = undefined;
}

export async function saveSettings(patch: Partial<ServerSettings>): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(
    Object.entries(patch).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue },
        update: { value: value as Prisma.InputJsonValue },
      }),
    ),
  );
  store.__albySettings = undefined;
}

const DAY_MS = 86_400_000;

/** Durata delle sessioni in millisecondi, secondo le impostazioni correnti. */
export async function getSessionLimits(): Promise<{ idleMs: number; maxMs: number }> {
  const s = await getSettings();
  return { idleMs: s.sessionIdleDays * DAY_MS, maxMs: s.sessionMaxDays * DAY_MS };
}
